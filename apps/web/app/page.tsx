import { SHARED_CONTRACT_VERSION } from "@watchme/shared";

export default function HomePage() {
  return (
    <main style={{ fontFamily: "system-ui", padding: "4rem", maxWidth: 640 }}>
      <h1>WatchMe AI</h1>
      <p>AI work reflection engine. Dashboard shell — features land per the roadmap.</p>
      <p style={{ color: "#888", fontSize: 14 }}>
        contract v{SHARED_CONTRACT_VERSION} · workspace wiring OK
      </p>
    </main>
  );
}
