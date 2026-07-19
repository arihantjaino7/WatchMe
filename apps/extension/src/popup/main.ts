/**
 * Popup entry point. Session start/end + intent field land in M1-E4.
 */

import { SHARED_CONTRACT_VERSION } from "@watchme/shared";

const status = document.getElementById("status");
if (status) {
  status.textContent = `Popup shell wired (contract v${SHARED_CONTRACT_VERSION}). Session controls land in M1.`;
}
