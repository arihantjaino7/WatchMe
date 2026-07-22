/**
 * @watchme/shared — the single source of truth for every contract that crosses
 * a boundary in WatchMe: extension <-> API, API <-> database, pipeline <-> dashboard.
 *
 * Rules for this package:
 * - Zod schemas first, TypeScript types derived from them (z.infer).
 * - No runtime dependencies besides zod. No I/O, no framework imports.
 * - Breaking changes to event/session schemas require an API version bump,
 *   because shipped extensions cannot be force-updated.
 */

export const SHARED_CONTRACT_VERSION = 1;

export * from "./activity-interpretation";
export * from "./api-version";
export * from "./compiled-timeline";
export * from "./domain-category";
export * from "./extension-auth";
export * from "./reflection";
export * from "./session-event";
export * from "./session";
