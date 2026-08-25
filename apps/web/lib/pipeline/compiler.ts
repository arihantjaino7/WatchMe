import {
  categorizeDomain,
  COMPILER_VERSION,
  type Category,
  type CategoryUsage,
  type CompiledTimeline,
  type DomainUsage,
  type SessionEvent,
  type TimelineBlock,
} from "@watchme/shared";

/**
 * Session Compiler (Agent 0, ARCHITECTURE.md §8) -- the deterministic, LLM-free
 * source of truth for every session metric. Pure function of the raw event
 * stream + session bounds; no I/O, so the golden-fixture suite exercises it
 * without a database.
 *
 * Event model (see apps/extension/src/background/filter.ts):
 *  - focus/url_change events OPEN a context at `occurredAt`;
 *  - blur events CLOSE the current context;
 *  - idle_start/idle_end bracket an idle gap (the focused tab resumes after,
 *    since idle_end emits no fresh focus event);
 *  - a `redacted` event carries a completed blocklisted span's durationMs,
 *    ending at its `occurredAt`.
 */

/** A brief flick to another context shorter than this is folded into its neighbour. */
export const MICRO_SWITCH_MS = 5_000;
/** An uninterrupted single-context block of at least this long is a focus block. */
export const FOCUS_BLOCK_MIN_MS = 10 * 60_000;

/** Minimal event shape the compiler reads; SessionEvent is structurally assignable. */
export type CompilerInputEvent = {
  type: SessionEvent["type"];
  /** Epoch milliseconds. */
  occurredAt: number;
  domain?: string | null;
  title?: string | null;
  durationMs?: number | null;
};

export type CompileBounds = { startedAtMs: number; endedAtMs: number };

type Block = {
  kind: "activity" | "idle" | "redacted";
  startMs: number;
  endMs: number;
  domain: string | null;
  category: Category | null;
  title: string | null;
};

export function compile(events: CompilerInputEvent[], bounds: CompileBounds): CompiledTimeline {
  const { startedAtMs, endedAtMs } = bounds;
  const clamp = (ms: number) => Math.min(Math.max(ms, startedAtMs), endedAtMs);

  const sorted = [...events].sort((a, b) => a.occurredAt - b.occurredAt);
  const blocks: Block[] = [];

  let open: { domain: string; title: string | null; startMs: number } | null = null;
  let idleSince: number | null = null;
  // idle_end emits no re-focus event, so remember the context to resume.
  let paused: { domain: string; title: string | null } | null = null;

  const closeActivity = (at: number) => {
    if (!open) return;
    const start = clamp(open.startMs);
    const end = clamp(at);
    if (end > start) {
      blocks.push({
        kind: "activity",
        startMs: start,
        endMs: end,
        domain: open.domain,
        category: categorizeDomain(open.domain),
        title: open.title,
      });
    }
    open = null;
  };

  for (const ev of sorted) {
    const at = ev.occurredAt;
    switch (ev.type) {
      case "tab_focus":
      case "window_focus":
      case "url_change": {
        if (idleSince !== null) break; // focus noise during an idle gap: ignore
        closeActivity(at);
        const domain = ev.domain ?? "";
        if (domain) open = { domain, title: ev.title ?? null, startMs: at };
        paused = null;
        break;
      }
      case "tab_blur":
      case "window_blur":
        closeActivity(at);
        break;
      case "idle_start": {
        if (idleSince !== null) break;
        paused = open ? { domain: open.domain, title: open.title } : null;
        closeActivity(at);
        idleSince = at;
        break;
      }
      case "idle_end": {
        if (idleSince === null) break;
        pushSpan(blocks, "idle", clamp(idleSince), clamp(at));
        idleSince = null;
        if (paused) {
          open = { domain: paused.domain, title: paused.title, startMs: at };
          paused = null;
        }
        break;
      }
      case "redacted": {
        const d = Math.max(0, ev.durationMs ?? 0);
        const start = at - d;
        if (open) closeActivity(Math.min(start, at));
        pushSpan(blocks, "redacted", clamp(start), clamp(at));
        break;
      }
    }
  }

  // Close whatever is still open when the session ended.
  if (idleSince !== null) {
    pushSpan(blocks, "idle", clamp(idleSince), endedAtMs);
  } else if (open) {
    closeActivity(endedAtMs);
  }

  blocks.sort((a, b) => a.startMs - b.startMs);
  const merged = mergeMicroSwitches(coalesceSameDomain(blocks));

  return aggregate(merged, startedAtMs, endedAtMs);
}

function pushSpan(
  blocks: Block[],
  kind: "idle" | "redacted",
  startMs: number,
  endMs: number,
): void {
  if (endMs > startMs) {
    blocks.push({ kind, startMs, endMs, domain: null, category: null, title: null });
  }
}

/** Merge directly-contiguous activity blocks on the same domain (e.g. url_change within a site). */
function coalesceSameDomain(blocks: Block[]): Block[] {
  const out: Block[] = [];
  for (const block of blocks) {
    const prev = out[out.length - 1];
    if (
      prev &&
      prev.kind === "activity" &&
      block.kind === "activity" &&
      prev.domain === block.domain &&
      prev.endMs === block.startMs
    ) {
      prev.endMs = block.endMs;
    } else {
      out.push({ ...block });
    }
  }
  return out;
}

/** Fold sub-5s activity blocks into a contiguous activity neighbour, then re-coalesce. */
function mergeMicroSwitches(blocks: Block[]): Block[] {
  let current = blocks;
  for (;;) {
    const idx = current.findIndex(
      (b) => b.kind === "activity" && b.endMs - b.startMs < MICRO_SWITCH_MS,
    );
    if (idx === -1) break;

    const micro = current[idx]!;
    const prev = current[idx - 1];
    const next = current[idx + 1];
    const next2 = current.slice();

    if (prev && prev.kind === "activity" && prev.endMs === micro.startMs) {
      prev.endMs = micro.endMs;
      next2.splice(idx, 1);
    } else if (next && next.kind === "activity" && next.startMs === micro.endMs) {
      next.startMs = micro.startMs;
      next2.splice(idx, 1);
    } else {
      // No contiguous activity neighbour: nothing to merge it into, leave it.
      break;
    }
    current = coalesceSameDomain(next2);
  }
  return current;
}

function aggregate(blocks: Block[], startedAtMs: number, endedAtMs: number): CompiledTimeline {
  const timeline: TimelineBlock[] = blocks.map((b) => ({
    kind: b.kind,
    startedAt: new Date(b.startMs).toISOString(),
    endedAt: new Date(b.endMs).toISOString(),
    durationMs: b.endMs - b.startMs,
    domain: b.domain,
    category: b.category,
    title: b.title,
    isFocus: b.kind === "activity" && b.endMs - b.startMs >= FOCUS_BLOCK_MIN_MS,
  }));

  const activity = timeline.filter((b) => b.kind === "activity");
  const activityMs = sum(activity.map((b) => b.durationMs));
  const redactedMs = sum(timeline.filter((b) => b.kind === "redacted").map((b) => b.durationMs));
  const idleMs = sum(timeline.filter((b) => b.kind === "idle").map((b) => b.durationMs));

  const activeDurationMs = activityMs + redactedMs;
  const focusBlocks = activity.filter((b) => b.isFocus);
  const focusDurationMs = sum(focusBlocks.map((b) => b.durationMs));
  const longestFocusBlockMs = focusBlocks.reduce((max, b) => Math.max(max, b.durationMs), 0);

  let contextSwitches = 0;
  for (let i = 1; i < activity.length; i++) {
    if (activity[i]!.domain !== activity[i - 1]!.domain) contextSwitches++;
  }

  const websiteUsage = buildDomainUsage(activity);
  const appUsage = buildCategoryUsage(activity, activeDurationMs);

  return {
    compilerVersion: COMPILER_VERSION,
    totalDurationMs: Math.max(0, endedAtMs - startedAtMs),
    activeDurationMs,
    focusDurationMs,
    idleDurationMs: idleMs,
    focusPercentage:
      activeDurationMs > 0 ? Math.round((focusDurationMs / activeDurationMs) * 100) : 0,
    contextSwitches,
    longestFocusBlockMs,
    appUsage,
    websiteUsage,
    blocks: timeline,
  };
}

function buildDomainUsage(activity: TimelineBlock[]): DomainUsage[] {
  const byDomain = new Map<string, DomainUsage>();
  for (const b of activity) {
    if (!b.domain) continue;
    const existing = byDomain.get(b.domain);
    if (existing) {
      existing.durationMs += b.durationMs;
      existing.visits += 1;
    } else {
      byDomain.set(b.domain, {
        domain: b.domain,
        category: b.category ?? "other",
        durationMs: b.durationMs,
        visits: 1,
      });
    }
  }
  return [...byDomain.values()].sort((a, b) => b.durationMs - a.durationMs);
}

function buildCategoryUsage(activity: TimelineBlock[], activeDurationMs: number): CategoryUsage[] {
  const byCategory = new Map<Category, number>();
  for (const b of activity) {
    const category = b.category ?? "other";
    byCategory.set(category, (byCategory.get(category) ?? 0) + b.durationMs);
  }
  return [...byCategory.entries()]
    .map(([category, durationMs]) => ({
      category,
      durationMs,
      percentage: activeDurationMs > 0 ? Math.round((durationMs / activeDurationMs) * 100) : 0,
    }))
    .sort((a, b) => b.durationMs - a.durationMs);
}

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
