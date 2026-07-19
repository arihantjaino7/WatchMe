"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });
    setStatus(error ? "error" : "sent");
  }

  async function signInWithGoogle() {
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  }

  return (
    <main className="login-page">
      <section className="login-hero">
        <span className="wm-wordmark wm-rise">
          WatchMe<span className="dot">.</span>
        </span>

        <h1 className="wm-rise wm-rise-2">
          A mirror for <em>how you actually work.</em>
        </h1>

        <p className="login-hero-foot wm-rise wm-rise-3">
          Session-based. Nothing is recorded unless you press start. Blocklisted sites never leave
          your machine.
        </p>
      </section>

      <section className="login-form-panel">
        <div className="login-card">
          <span className="wm-kicker wm-rise">Sign in</span>
          <h2 className="wm-rise wm-rise-2">Begin a session of honesty.</h2>

          {status === "sent" ? (
            <div className="login-sent wm-rise">
              <strong>Check your email.</strong>
              <p style={{ margin: "0.3rem 0 0", color: "var(--ink-soft)" }}>
                A magic link is on its way to {email}.
              </p>
            </div>
          ) : (
            <form
              onSubmit={sendMagicLink}
              className="wm-rise wm-rise-3"
              style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
            >
              <input
                className="wm-input"
                type="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button className="wm-btn" type="submit" disabled={status === "sending"}>
                {status === "sending" ? "Sending…" : "Send magic link"}
              </button>
              {status === "error" && (
                <p className="login-error">Something went wrong. Try again.</p>
              )}
            </form>
          )}

          <div className="login-divider wm-rise wm-rise-4">or</div>

          <button
            className="wm-btn wm-btn--ghost wm-rise wm-rise-4"
            type="button"
            onClick={signInWithGoogle}
          >
            Continue with Google
          </button>
        </div>
      </section>
    </main>
  );
}
