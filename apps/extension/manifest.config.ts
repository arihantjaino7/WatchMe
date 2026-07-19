import { defineManifest } from "@crxjs/vite-plugin";

/**
 * Permissions policy (see docs/ROADMAP.md M1-E1): request the absolute minimum.
 * No content scripts, no <all_urls> host permission — tab metadata only.
 * Every added permission makes Web Store review slower and users warier.
 */
export default defineManifest({
  manifest_version: 3,
  name: "WatchMe AI",
  description:
    "Session-based work reflection. Records browser activity only while you run a session.",
  version: "0.0.1",
  permissions: ["tabs", "storage", "idle", "alarms"],
  background: {
    service_worker: "src/background/index.ts",
    type: "module",
  },
  action: {
    default_popup: "src/popup/index.html",
    default_title: "WatchMe AI",
  },
});
