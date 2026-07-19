import { createClient } from "@/lib/supabase/server";
import { signOut } from "./actions";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <>
      <header className="shell-header">
        <span className="wm-wordmark">
          WatchMe<span className="dot">.</span>
        </span>
        <div className="shell-user">
          <span>{user?.email}</span>
          <form action={signOut}>
            <button
              className="wm-btn wm-btn--ghost"
              type="submit"
              style={{ padding: "0.4rem 1rem", fontSize: "0.82rem" }}
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      <main className="shell-main">
        <span className="wm-kicker wm-rise">Sessions</span>
        <h1 className="wm-rise wm-rise-2">Your work, reflected.</h1>
        <p className="shell-sub wm-rise wm-rise-3">
          Every session you run becomes an honest account of where your attention went — and whether
          it went where you intended.
        </p>

        <div className="empty-session-card wm-rise wm-rise-4">
          <span className="wm-kicker">No sessions yet</span>
          <h2>Run your first session.</h2>
          <p>
            Sessions are recorded by the WatchMe Chrome extension, only while you have one running.
          </p>
          <ol className="empty-session-steps">
            <li>Install the WatchMe extension (arrives with milestone M1).</li>
            <li>Click it, declare what you intend to do, and press start.</li>
            <li>Work. End the session. Read the reflection here.</li>
          </ol>
        </div>

        <p className="shell-footnote">
          Nothing is captured outside an active session · blocklisted domains are redacted on your
          device
        </p>
      </main>
    </>
  );
}
