# WatchMe AI — Architecture

This is the full product and system architecture, carried over from planning. It is the reference for _what_ to build and _why_; [ROADMAP.md](ROADMAP.md) breaks it into the _order_ to build it in.

---

## 1. Product vision

**"Strava for knowledge work."** Strava didn't invent GPS tracking — it made athletes _understand and improve_ their training. WatchMe AI doesn't invent activity tracking — it turns raw work activity into self-knowledge. The product is a mirror, not a boss. Every existing tracker (RescueTime, Rize, ActivityWatch) answers _"what did I do?"_ with charts. WatchMe AI answers _"how do I actually work, and what should I change?"_ with narrative, evidence-backed reflection.

North-star loop: **Declare intent → Work → Get honest reflection → Adjust → Repeat.**

## 2. Who it's for

**Primary (V1):** self-improving solo knowledge workers — developers, writers, students, indie hackers, freelancers who opt into tracking themselves.

**Explicitly not for (V1):** managers tracking employees. Trust-destroying market; the brand is "you watching yourself." This is a moat, not a gap to fill later.

## 3. Why this instead of ChatGPT or existing tools

- **vs ChatGPT:** ChatGPT only knows what you tell it, and people narrate their own work badly. WatchMe has ground-truth observational data.
- **vs RescueTime/Rize:** dashboards and categories, no narrative, no memory, no intent grading.
- **vs ActivityWatch:** raw data collector, no intelligence layer.

**The wedge — intent vs reality:** at session start the user declares a goal. The reflection engine grades the session against it. No competitor does this; it's cheap to build and reframes the product from "tracker" to "accountability mirror."

## 4. Core problem

Knowledge workers have no feedback loop on their own work process. The problem isn't lack of data — it's lack of interpretation and memory.

## 5. MVP scope (V1)

1. Auth — email magic-link + Google OAuth (Supabase Auth).
2. Chrome extension — start/end session, optional intent, tab focus capture, local privacy filter, batch upload.
3. Session lifecycle — server-side sessions, auto-end stale sessions.
4. Deterministic timeline — server compiles raw events into activity blocks, no LLM involved. Must be useful standalone.
5. AI reflection report — 2-stage LLM pipeline: narrative, focus analysis, distraction analysis, intent-vs-reality verdict, 1–3 suggestions.
6. Dashboard — session list, session detail, settings/privacy.
7. Privacy controls — blocklist, capture pause, full export, full deletion.

**Definition of done for MVP:** a stranger installs the extension, runs a real 2-hour session, and reads a report that tells them something they didn't already know.

## 6. Not in V1 (and why)

- Cross-session Q&A/chat — needs embeddings + accumulated data; cold-start makes it feel broken day 1. Headline of V2.
- Trends/analytics — meaningless with <10 sessions.
- Desktop agent — 3–4x scope, code signing, OS permissions. Event schema is source-agnostic so this bolts on later.
- Page-content capture — privacy escalation + LLM-cost explosion for marginal gain over URL+title.
- Real-time nudges — different product (intervention vs reflection), often wrong early on.
- Teams, sharing, billing, mobile, Firefox/Safari.
- True parallel multi-agent orchestration — V1's sequential 3-stage pipeline is the correct call, not a compromise (see §8).

## 7. Future versions

- **V1.5:** weekly email digest, trends screen, session comparison, tagging.
- **V2:** memory & Q&A — pgvector embeddings of session summaries, RAG chat over history. Baseline calibration.
- **V2.5:** desktop agent (Tauri) emitting the same event schema. Calendar integration as context.
- **V3:** coach mode, longitudinal experiments, API/export integrations, paid tiers.

## 8. Multi-agent architecture

A swarm of parallel agents in V1 is overengineering — more cost, more latency, more failure modes, agents restating each other. The right shape: **a sequential 3-stage pipeline where each stage has one job**, plus deterministic pre-processing that isn't an "agent" at all.

| #   | Agent                | LLM?                             | Runs                     |
| --- | -------------------- | -------------------------------- | ------------------------ |
| 0   | Session Compiler     | No — pure code                   | On session end, first    |
| 1   | Activity Interpreter | Cheap/fast (Gemini Flash / Groq) | After 0                  |
| 2   | Reflection Analyst   | Best available free model        | After 1                  |
| 3   | Memory Indexer (V2)  | Embeddings only                  | After 2, fire-and-forget |

**Agent 0 — Session Compiler (deterministic).** Converts raw tab events into a clean timeline: merges micro-switches (<5s), computes per-domain durations, focus blocks (≥10min single context), switch counts, idle gaps, category via a static domain→category map. Input: raw `events`. Output: `timeline_blocks` + stats. Why: LLMs are bad at arithmetic over hundreds of timestamps; this is free, testable, and the dashboard renders from it even if every LLM call fails. **Most important reliability decision in the system.**

**Agent 1 — Activity Interpreter.** Semantic labeling the domain map can't do — groups blocks into narrative "work episodes," classifies ambiguous activity using page titles, flags rabbit hole candidates. Input: timeline + stats + intent. Output: episode list with labels, relevance-to-intent, distraction candidates. Cheap model is fine — classification/grouping, not reasoning.

**Agent 2 — Reflection Analyst.** The product. Writes the report: narrative, focus assessment, distraction patterns, intent-vs-reality verdict, 1–3 evidence-grounded suggestions. Input: Agent 1's episodes + stats + intent + (V1.5) recent session summaries. Output: report JSON persisted to `reports`. Separated from Agent 1 so cheap classification and judgment-quality reflection can use different models independently — this is also where a future paid model upgrade slots in.

**Agent 3 — Memory Indexer (V2).** Embeds session summary + episodes into pgvector. Fire-and-forget, nothing downstream waits on it.

**Orchestration:** one durable job (`analyzeSession(sessionId)`) via Inngest, each agent = one step → automatic per-stage retry, resumability, observability. If a stage fails permanently, the deterministic timeline still renders with a "reflection unavailable — retry" button.

**LLM provider abstraction:** single `llm.ts` exposing `complete(task, messages, schema)` with per-task model routing in config. V1 routes: interpret→Gemini 2.0 Flash (free) with Groq Llama-3.3-70B fallback; reflect→best free-tier model available. **Rule: no file outside `llm.ts` may name a model or import a provider SDK.** Gemini's free tier is rate-limited and may train on submitted data — acceptable for MVP/beta, must be revisited (or BYOK offered) before charging users.

## 9. System architecture & stack

```
Chrome Extension (MV3, TS)                    Vercel
+-------------------------+    HTTPS/JSON   +-------------------------------+
| service worker           |---------------->| Next.js App Router            |
|  - session state         |   REST + JWT   |  - /api/v1/* (extension API)  |
|  - tab event capture     |                |  - dashboard (React)          |
|  - privacy filter        |                |  - server actions (dashboard) |
|  - IndexedDB buffer      |                +------+-----------+------------+
| popup UI (start/end/goal)|                       |           | triggers
+-------------------------+                       v           v
                                          Supabase Postgres   Inngest jobs
                                          (+Auth, +pgvector)   | analyzeSession
                                                                v
                                                         llm.ts -> Gemini/Groq
```

Decisions: TypeScript everywhere (extension must be JS/TS anyway; one shared `packages/shared` of Zod schemas as single source of truth for the event contract). Next.js on Vercel for dashboard+API in one deployable — long-running LLM work goes through Inngest since serverless functions can't hold a 2-minute pipeline. Supabase for Postgres+Auth+RLS+pgvector in one free tier, all DB access behind a repository layer to limit lock-in. No microservices, no queues to operate, no Docker/K8s — modularity via package boundaries, not network boundaries.

## 10. Data flow (end to end)

1. Extension popup → "Start session" (+ optional intent) → `POST /api/v1/sessions` → `sessionId` stored in `chrome.storage.session`.
2. Service worker listens to `tabs.onActivated`, `tabs.onUpdated`, `windows.onFocusChanged`, `idle.onStateChanged`; each transition emits an event.
3. **Local privacy filter, pre-buffer:** blocklisted domain → redacted (duration only, no URL/title); incognito → never captured; URLs stripped to origin+path.
4. Events buffer in IndexedDB, flushed batched (≤100) every 30s/50 events/on end. `clientEventId` makes ingestion idempotent — safe retries, safe offline buffering.
5. "End session" → final flush → `POST /api/v1/sessions/:id/end` → enqueues Inngest `session/analyze`.
6. Pipeline: Compiler → Interpreter → Analyst → persists `timeline_blocks` + `reports`, sets `analysis_status='complete'`.
7. Dashboard renders timeline immediately, report when ready.
8. Safety nets: 60-min-idle sessions auto-ended by scheduled job; service-worker restarts recover state from `chrome.storage.session`.

## 11. Database design (Postgres / Supabase)

See `supabase/migrations/` for the authoritative schema once M0-E2 lands. Tables: `profiles`, `user_settings`, `sessions`, `events` (immutable raw log, idempotent via `UNIQUE(session_id, client_event_id)`), `timeline_blocks` (derived, queryable), `reports` (versioned), `memories` (V2, pgvector — table shipped early, empty until V2). RLS on every table: `user_id = auth.uid()`. Raw `events` pruned after 90 days; derived data retained.

## 12. API design

All extension-facing routes versioned under `/api/v1/` (extensions in the wild can't be force-updated):

- `POST /sessions` — start; rejects or returns existing active session.
- `POST /sessions/:id/events` — idempotent batch ingest.
- `POST /sessions/:id/end` — end + enqueue analysis.
- `GET /sessions/active` — recovery after service-worker restart.
- `POST /auth/extension` — one-time-code → token exchange.

Dashboard (cookie-session server actions/route handlers): `GET /sessions`, `GET /sessions/:id`, `POST /sessions/:id/reanalyze`, `GET/PUT /settings`, `GET /me/export`, `DELETE /me`.

## 13. Chrome extension architecture

MV3 service worker holds no state in module scope (it _will_ be killed and restarted) — everything in `chrome.storage.session` + IndexedDB, periodic flush via `chrome.alarms`, reconcile-on-wake against `GET /sessions/active`. No content scripts in V1 — tab metadata only via `chrome.tabs`, minimal permissions (`tabs`, `storage`, `idle`, `alarms`, host permission scoped to our API origin). Auth handoff via one-time-code (web login → code → extension exchanges for refresh token) rather than fragile cookie-sharing or `chrome.identity`. Plain HTTPS REST, no WebSockets — nothing needs server→extension push in V1.

## 14. Dashboard screens

1. **Sessions (home)** — reverse-chron cards: date, intent, duration, focus %, top category, 1-line takeaway, status chip. Empty state = onboarding.
2. **Session detail** — the core screen: header verdict, colored timeline (redacted blocks shown as private-but-counted), full reflection report, stats strip. Timeline renders even mid-analysis.
3. **Settings/Privacy** — blocklist editor, category overrides, AI on/off, extension connection status, export, delete. First-class placement — this page is marketing.
4. _(V1.5)_ Trends. _(V2)_ Ask/Chat.

## 15. Authentication

Web: Supabase Auth (Google OAuth + magic link), cookie session. Extension: one-time-code handoff → refresh token in `chrome.storage.local` → rotating short-lived JWTs, revocable per device.

## 16–17. Security & privacy

Security: RLS everywhere (defense in depth behind app checks), JWT verification on every extension endpoint, strict Zod validation on ingestion, rate limiting per user, HTTPS only, no service-role key outside server code, host permissions scoped to API origin.

Privacy (product-defining): capture only during an explicit session, never passive; local redaction before upload; never store page content in V1; visible recording indicator; export + delete are MVP features; retention limits on raw events; honest disclosure of free-tier LLM data handling.

## 18. Scalability

The bottleneck for the next 12 months is insight quality, not scale. Stateless Vercel functions scale horizontally; Postgres handles millions of event rows trivially at expected volume; Inngest absorbs analysis bursts with concurrency caps. First real ceiling: free-tier LLM rate limits — mitigated by per-provider throttling, fallback provider, graceful "report pending" UX.

## 19. Deployment

Vercel: `main`→production, PRs→preview deploys. Supabase: cloud project prod, local Supabase for dev, migrations via CLI checked into repo, applied through CI — never hand-edit prod schema. Extension: versioned zip via GitHub Action, manual Web Store upload (review takes days, decoupled from API releases via versioning). No staging environment until there are users to protect.

## 20–21. Repository structure

See [README.md](../README.md#repository-layout). One monorepo, pnpm + Turborepo, `packages/shared` as the single contract source imported by both extension and server.

## 25. Notable additions beyond the original brief

- **Intent declaration** promoted into MVP — the biggest single addition; it's what makes single-session reports meaningful from day one.
- **Weekly digest email** (V1.5) — the return-visit lever reflection products live or die on.
- **Cross-session pattern memory without full chat** — feed Agent 2 summaries of recent sessions before RAG/Q&A exists, for zero extra complexity.
- **Calibration framing** — label a user's first 5 sessions "calibration" to set expectations while data accumulates.
- **Prompt-eval harness** (dev tooling, lands with M3) — fixtures of real sessions + assertions on report output, so prompt changes aren't vibes-based regressions.

## 26. Known weaknesses (self-review)

1. Deepest risk is unvalidated demand, not architecture — mitigate by dogfooding as early as M2, before AI is even built.
2. Three vendors (Supabase/Vercel/Inngest) for one MVP — deliberate for a solo/part-time build, contained by a repository layer; revisit at revenue.
3. Browser-only V1 yields thin data for some sessions (e.g. deep work in a single web IDE tab) — reports should acknowledge low-signal sessions rather than hallucinate depth.
4. "Multi-agent" is honest but architecturally modest today — designed to upgrade stage-by-stage into genuine parallel specialists once the base report proves valuable.
5. Timezone/DST handling for "morning vs evening" insights needs UTC storage + explicit localization at the prompt layer — flagged for the M3 checklist.
6. What to cut first under time pressure: category-override UI (hardcode the map), Google OAuth (magic link only), report versioning UI. What never to cut: privacy filter, idempotent ingestion, deterministic compiler.
