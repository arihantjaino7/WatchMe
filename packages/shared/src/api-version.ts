/**
 * Extensions in the wild can't be force-updated, so the event/session contract
 * is versioned and changes to it are additive-only. Bump this only when a
 * breaking change ships, and keep the old version's route/handlers alive
 * until installed extensions have migrated.
 */
export const API_VERSION = "v1";
export const API_PREFIX = `/api/${API_VERSION}`;
