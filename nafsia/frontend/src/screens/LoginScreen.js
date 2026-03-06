import { useState } from "react";

export default function LoginScreen({ onLogin }) {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(false);

  const roles = [
    { id: "patient", label: "I need support", icon: "💚", color: "#00FFB2", sub: "Talk to NAFSIA privately and safely" },
    { id: "counselor", label: "I am a counselor", icon: "🩺", color: "#4DFFFF", sub: "Monitor sessions and intervene" },
  ];

  async function handleLogin() {
    if (!role) return;
    setLoading(true);
    await new Promise(r => setTimeout(r, 500));
    onLogin(role);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#05050E", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center" }}>

      <div style={{ fontSize: 10, letterSpacing: 6, color: "#FF3CAC",
        fontFamily: "monospace", marginBottom: 12 }}>ASTARVA 2026</div>

      <div style={{ fontSize: 48, fontWeight: "bold", color: "#FFF", marginBottom: 8 }}>
        NAFSIA
      </div>

      <div style={{ fontSize: 13, color: "#555", marginBottom: 60,
        textAlign: "center", maxWidth: 360 }}>
        Neuro-Adaptive Frontline Support and Intervention AI
      </div>

      <div style={{ display: "flex", gap: 20, marginBottom: 40 }}>
        {roles.map(r => (
          <div key={r.id} onClick={() => setRole(r.id)}
            style={{ width: 200, padding: 28,
              background: role === r.id ? r.color + "15" : "#0D0D22",
              border: "2px solid " + (role === r.id ? r.color : "#222"),
              borderRadius: 16, cursor: "pointer", textAlign: "center",
              transition: "all 0.3s",
              transform: role === r.id ? "scale(1.04)" : "scale(1)" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>{r.icon}</div>
            <div style={{ fontSize: 15, fontWeight: "bold",
              color: role === r.id ? r.color : "#FFF", marginBottom: 8 }}>{r.label}</div>
            <div style={{ fontSize: 11, color: "#555", lineHeight: 1.5 }}>{r.sub}</div>
          </div>
        ))}
      </div>

      {role && (
        <button onClick={handleLogin} disabled={loading}
          style={{ background: role === "patient" ? "#00FFB2" : "#4DFFFF",
            color: "#000", border: "none", borderRadius: 28,
            padding: "14px 48px", fontSize: 15, fontWeight: "bold", cursor: "pointer" }}>
          {loading ? "Connecting..." : "Enter"}
        </button>
      )}
    </div>
  );
}
