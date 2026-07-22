import { EventSchemas, Inngest } from "inngest";

/**
 * Inngest client for WatchMe's durable jobs. Signing/event keys are read from
 * the environment (`INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY`) by Inngest
 * automatically; locally the Inngest dev server needs neither.
 */
type Events = {
  "session/analyze": { data: { sessionId: string } };
};

export const inngest = new Inngest({
  id: "watchme",
  schemas: new EventSchemas().fromRecord<Events>(),
});
