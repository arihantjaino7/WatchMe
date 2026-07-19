import { defineManifest } from "@crxjs/vite-plugin";

/**
 * Permissions policy (see docs/ROADMAP.md M1-E1): request the absolute minimum.
 * No content scripts, no <all_urls> host permission — tab metadata only.
 * Every added permission makes Web Store review slower and users warier.
 *
 * host_permissions is scoped to the WatchMe backend ONLY (never <all_urls>).
 * MV3 requires this: without it the service worker's fetch to our own API is
 * blocked by CORS before it leaves the browser. localhost is included for dev;
 * it's inert in a production install that only ever calls the Vercel host.
 */
export default defineManifest({
  manifest_version: 3,
  name: "WatchMe AI",
  description:
    "Session-based work reflection. Records browser activity only while you run a session.",
  version: "0.0.1",
  permissions: ["tabs", "storage", "idle", "alarms"],
  host_permissions: ["https://watchme-web.vercel.app/*", "http://localhost:3000/*"],
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "WatchMe AI",
  },
});
