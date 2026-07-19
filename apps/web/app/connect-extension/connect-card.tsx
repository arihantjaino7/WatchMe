"use client";

import { useEffect, useState } from "react";
import { generateConnectCode, type ConnectCodeResult } from "./actions";

/** "ABCDEFGH" -> "ABCD-EFGH" for display; the exchange endpoint strips dashes. */
function displayCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

export function ConnectCard() {
  const [result, setResult] = useState<ConnectCodeResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  async function mint() {
    setBusy(true);
    const next = await generateConnectCode();
    setResult(next);
    setBusy(false);
  }

  useEffect(() => {
    if (!result || "error" in result) {
      setSecondsLeft(null);
      return;
    }
    const expires = new Date(result.expiresAt).getTime();
    const tick = () => setSecondsLeft(Math.max(0, Math.floor((expires - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [result]);

  const expired = secondsLeft === 0;

  if (!result || "error" in result) {
    return (
      <div className="connect-card wm-rise wm-rise-4">
        <p className="connect-card-lead">
          The code links the extension to your account. It works once, then burns.
        </p>
        <button className="wm-btn" type="button" onClick={mint} disabled={busy}>
          {busy ? "Generating…" : "Generate connect code"}
        </button>
        {result && "error" in result && <p className="login-error">{result.error}</p>}
      </div>
    );
  }

  return (
    <div className="connect-card wm-rise">
      <span className="wm-kicker">Your code</span>
      <div className={`connect-code${expired ? " connect-code--expired" : ""}`}>
        {displayCode(result.code)}
      </div>
      <p className="connect-card-meta">
        {expired ? (
          <>This code has expired.</>
        ) : (
          <>
            Single use · expires in{" "}
            <strong>
              {Math.floor((secondsLeft ?? 0) / 60)}:
              {String((secondsLeft ?? 0) % 60).padStart(2, "0")}
            </strong>
          </>
        )}
      </p>
      <button className="wm-btn wm-btn--ghost" type="button" onClick={mint} disabled={busy}>
        {busy ? "Generating…" : "Generate a new code"}
      </button>
    </div>
  );
}
