import Link from "next/link";
import { ConnectCard } from "./connect-card";

export default function ConnectExtensionPage() {
  return (
    <>
      <header className="shell-header">
        <Link href="/" style={{ textDecoration: "none", color: "inherit" }}>
          <span className="wm-wordmark">
            WatchMe<span className="dot">.</span>
          </span>
        </Link>
      </header>

      <main className="shell-main">
        <span className="wm-kicker wm-rise">Extension</span>
        <h1 className="wm-rise wm-rise-2">Introduce the extension to your journal.</h1>
        <p className="shell-sub wm-rise wm-rise-3">
          One code, typed once, and the extension can write sessions here on your behalf — nothing
          else, and only while a session is running.
        </p>

        <ol className="empty-session-steps wm-rise wm-rise-3" style={{ marginBottom: "1.6rem" }}>
          <li>Open the WatchMe extension popup in Chrome.</li>
          <li>Choose “Connect to WatchMe.”</li>
          <li>Type the code below before it expires.</li>
        </ol>

        <ConnectCard />

        <p className="shell-footnote">
          Codes are stored only as hashes and die on first use · you can disconnect any time by
          removing the extension
        </p>
      </main>
    </>
  );
}
