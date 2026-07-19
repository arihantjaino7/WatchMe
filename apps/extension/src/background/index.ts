/**
 * MV3 service worker entry point.
 *
 * Lifecycle rule that governs everything written here (M1): this worker is
 * killed and restarted constantly. It must hold NO state in module scope —
 * session state lives in chrome.storage.session, the event buffer in
 * IndexedDB, and every wake-up reconciles with the server.
 *
 * Capture logic lands in M1-E2. This stub only proves the build pipeline.
 */

import { SHARED_CONTRACT_VERSION } from "@watchme/shared";

chrome.runtime.onInstalled.addListener(() => {
  console.log(`WatchMe AI installed (contract v${SHARED_CONTRACT_VERSION})`);
});
