import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ActiveSessionResponseSchema,
  EndSessionResponseSchema,
  EventBatchResponseSchema,
  StartSessionResponseSchema,
  type SessionEvent,
} from "@watchme/shared";
import { POST as startPost } from "@/app/api/v1/sessions/route";
import { GET as activeGet } from "@/app/api/v1/sessions/active/route";
import { POST as endPost } from "@/app/api/v1/sessions/[id]/end/route";
import { POST as eventsPost } from "@/app/api/v1/sessions/[id]/events/route";
import {
  createTestUser,
  deleteTestUser,
  jsonRequest,
  routeParams,
  serviceClient,
  type TestUser,
} from "./helpers";

function tabEvent(overrides: Partial<SessionEvent> = {}): SessionEvent {
  return {
    clientEventId: crypto.randomUUID(),
    source: "extension",
    occurredAt: Date.now(),
    type: "tab_focus",
    url: "https://github.com/arihantjaino7/WatchMe",
    title: "WatchMe repo",
    domain: "github.com",
    ...overrides,
  } as SessionEvent;
}

describe("session lifecycle (M1-E2)", () => {
  let user: TestUser;

  beforeAll(async () => {
    user = await createTestUser();
  });
  afterAll(async () => {
    await deleteTestUser(user.id);
  });

  it("requires auth on every endpoint", async () => {
    expect((await startPost(jsonRequest("/api/v1/sessions", { body: {} }))).status).toBe(401);
    expect(
      (await activeGet(jsonRequest("/api/v1/sessions/active", { method: "GET" }))).status,
    ).toBe(401);
  });

  it("GET /sessions/active returns null before any session exists", async () => {
    const res = await activeGet(
      jsonRequest("/api/v1/sessions/active", { method: "GET", token: user.accessToken }),
    );
    expect(res.status).toBe(200);
    const body = ActiveSessionResponseSchema.parse(await res.json());
    expect(body.session).toBeNull();
  });

  it("starting twice returns the same sessionId (M1-E2-T1 AC)", async () => {
    const first = await startPost(
      jsonRequest("/api/v1/sessions", { token: user.accessToken, body: { intent: "write M1" } }),
    );
    expect(first.status).toBe(201);
    const firstBody = StartSessionResponseSchema.parse(await first.json());
    expect(firstBody.reused).toBe(false);
    expect(firstBody.session.intent).toBe("write M1");
    expect(firstBody.session.endedAt).toBeNull();

    const second = await startPost(
      jsonRequest("/api/v1/sessions", { token: user.accessToken, body: {} }),
    );
    expect(second.status).toBe(200);
    const secondBody = StartSessionResponseSchema.parse(await second.json());
    expect(secondBody.reused).toBe(true);
    expect(secondBody.session.id).toBe(firstBody.session.id);
  });

  it("GET /sessions/active returns the running session (M1-E2-T3 AC)", async () => {
    const res = await activeGet(
      jsonRequest("/api/v1/sessions/active", { method: "GET", token: user.accessToken }),
    );
    const body = ActiveSessionResponseSchema.parse(await res.json());
    expect(body.session?.intent).toBe("write M1");
  });

  it("accepts an event batch exactly once (M1-E3-T4 server AC)", async () => {
    const active = ActiveSessionResponseSchema.parse(
      await (
        await activeGet(
          jsonRequest("/api/v1/sessions/active", { method: "GET", token: user.accessToken }),
        )
      ).json(),
    );
    const sessionId = active.session!.id;

    const events = [tabEvent(), tabEvent({ type: "idle_start" } as Partial<SessionEvent>)];
    const first = await eventsPost(
      jsonRequest(`/api/v1/sessions/${sessionId}/events`, {
        token: user.accessToken,
        body: { events },
      }),
      routeParams(sessionId),
    );
    expect(first.status).toBe(200);
    expect(EventBatchResponseSchema.parse(await first.json()).accepted).toBe(2);

    // Replay of the identical batch (simulated retry) inserts nothing.
    const replay = await eventsPost(
      jsonRequest(`/api/v1/sessions/${sessionId}/events`, {
        token: user.accessToken,
        body: { events },
      }),
      routeParams(sessionId),
    );
    expect(replay.status).toBe(200);
    expect(EventBatchResponseSchema.parse(await replay.json()).accepted).toBe(0);

    const { count } = await serviceClient()
      .from("events")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);
    expect(count).toBe(2);
  });

  it("rejects malformed batches and foreign sessions", async () => {
    const active = ActiveSessionResponseSchema.parse(
      await (
        await activeGet(
          jsonRequest("/api/v1/sessions/active", { method: "GET", token: user.accessToken }),
        )
      ).json(),
    );
    const sessionId = active.session!.id;

    const bad = await eventsPost(
      jsonRequest(`/api/v1/sessions/${sessionId}/events`, {
        token: user.accessToken,
        body: { events: [{ type: "tab_focus" }] },
      }),
      routeParams(sessionId),
    );
    expect(bad.status).toBe(400);

    const stranger = await createTestUser();
    try {
      const foreign = await eventsPost(
        jsonRequest(`/api/v1/sessions/${sessionId}/events`, {
          token: stranger.accessToken,
          body: { events: [tabEvent()] },
        }),
        routeParams(sessionId),
      );
      expect(foreign.status).toBe(404);
    } finally {
      await deleteTestUser(stranger.id);
    }
  });

  it("ends a session; ending again is a no-op (M1-E2-T2 AC)", async () => {
    const active = ActiveSessionResponseSchema.parse(
      await (
        await activeGet(
          jsonRequest("/api/v1/sessions/active", { method: "GET", token: user.accessToken }),
        )
      ).json(),
    );
    const sessionId = active.session!.id;

    const ended = await endPost(
      jsonRequest(`/api/v1/sessions/${sessionId}/end`, { token: user.accessToken }),
      routeParams(sessionId),
    );
    expect(ended.status).toBe(200);
    const endedBody = EndSessionResponseSchema.parse(await ended.json());
    expect(endedBody.session.endedAt).not.toBeNull();
    expect(endedBody.session.endReason).toBe("user");

    const again = await endPost(
      jsonRequest(`/api/v1/sessions/${sessionId}/end`, { token: user.accessToken }),
      routeParams(sessionId),
    );
    expect(again.status).toBe(200);
    const againBody = EndSessionResponseSchema.parse(await again.json());
    expect(againBody.session.id).toBe(sessionId);
    expect(againBody.session.endedAt).toBe(endedBody.session.endedAt);

    const gone = await activeGet(
      jsonRequest("/api/v1/sessions/active", { method: "GET", token: user.accessToken }),
    );
    expect(ActiveSessionResponseSchema.parse(await gone.json()).session).toBeNull();

    const missing = await endPost(
      jsonRequest(`/api/v1/sessions/${crypto.randomUUID()}/end`, { token: user.accessToken }),
      routeParams(crypto.randomUUID()),
    );
    expect(missing.status).toBe(404);
  });

  it("auto-ends sessions idle for 60+ minutes (M1-E2-T4 AC)", async () => {
    const service = serviceClient();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    // Backdated stale session for `user` (their previous session is ended).
    const { data: stale, error: staleError } = await service
      .from("sessions")
      .insert({ user_id: user.id, started_at: twoHoursAgo, last_event_at: twoHoursAgo })
      .select("id")
      .single();
    expect(staleError).toBeNull();

    // A second user's fresh session must survive the sweep untouched.
    const bystander = await createTestUser();
    try {
      const freshRes = await startPost(
        jsonRequest("/api/v1/sessions", { token: bystander.accessToken, body: {} }),
      );
      const fresh = StartSessionResponseSchema.parse(await freshRes.json());

      const { data: endedCount, error: rpcError } = await service.rpc("auto_end_idle_sessions");
      expect(rpcError).toBeNull();
      expect(endedCount).toBeGreaterThanOrEqual(1);

      const { data: staleAfter } = await service
        .from("sessions")
        .select("ended_at, end_reason")
        .eq("id", stale!.id)
        .single();
      expect(staleAfter!.ended_at).not.toBeNull();
      expect(staleAfter!.end_reason).toBe("auto");

      const { data: freshAfter } = await service
        .from("sessions")
        .select("ended_at")
        .eq("id", fresh.session.id)
        .single();
      expect(freshAfter!.ended_at).toBeNull();
    } finally {
      await deleteTestUser(bystander.id);
    }
  });
});
