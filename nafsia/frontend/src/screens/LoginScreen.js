import { useState } from "react";

export default function LoginScreen({ onLogin }) {
  const [role, setRole] = useState(null);
  const [loading, setLoading] = useState(false);

  const roles = [
    {
      id: "patient",
      label: "I need support",
      icon: "💚",
      color: "#87f5cf",
      sub: "Talk to NAFSIA privately and safely",
    },
    {
      id: "counselor",
      label: "I am a counselor",
      icon: "🩺",
      color: "#7dd3fc",
      sub: "Monitor sessions and intervene",
    },
  ];

  async function handleLogin() {
    if (!role) return;
    setLoading(true);
    await new Promise((r) => setTimeout(r, 500));
    onLogin(role);
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 28,
      }}
    >
      <div
        style={{
          width: "min(1080px, 100%)",
          padding: "34px 34px 40px",
          borderRadius: 30,
          background: "var(--nafsia-panel)",
          border: "1px solid var(--nafsia-line)",
          boxShadow: "var(--nafsia-shadow)",
          backdropFilter: "blur(18px)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 24,
            flexWrap: "wrap",
            marginBottom: 42,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 11,
                letterSpacing: 5,
                color: "#f5b8d8",
                fontFamily: "monospace",
                marginBottom: 14,
              }}
            >
              ASTARVA 2026
            </div>
            <div
              style={{
                fontSize: "clamp(3rem, 9vw, 5.4rem)",
                fontWeight: "bold",
                color: "#FFF",
                marginBottom: 10,
                lineHeight: 0.94,
              }}
            >
              NAFSIA
            </div>
            <div
              style={{
                fontSize: 16,
                color: "var(--nafsia-muted)",
                maxWidth: 500,
                lineHeight: 1.7,
              }}
            >
              Neuro-Adaptive Frontline Support and Intervention AI. A calmer,
              more credible interface for people seeking support and counselors
              monitoring risk in real time.
            </div>
          </div>

          <div
            style={{
              minWidth: 220,
              padding: 20,
              borderRadius: 22,
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--nafsia-line)",
              alignSelf: "flex-start",
            }}
          >
            <div
              style={{
                fontSize: 12,
                color: "var(--nafsia-muted)",
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                marginBottom: 10,
              }}
            >
              Experience
            </div>
            <div style={{ color: "#fff", fontSize: 15, lineHeight: 1.7 }}>
              Patient mode offers a private, responsive conversation flow.
              Counselor mode surfaces live risk, alerts, SOAP output, and
              intervention controls.
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 20,
            marginBottom: 36,
            flexWrap: "wrap",
          }}
        >
          {roles.map((r) => (
            <div
              key={r.id}
              onClick={() => setRole(r.id)}
              style={{
                flex: "1 1 280px",
                padding: 30,
                background:
                  role === r.id ? r.color + "10" : "rgba(8, 14, 29, 0.72)",
                border:
                  "1px solid " +
                  (role === r.id ? r.color + "66" : "var(--nafsia-line)"),
                borderRadius: 24,
                cursor: "pointer",
                textAlign: "left",
                transition: "all 0.3s ease",
                transform:
                  role === r.id ? "translateY(-3px)" : "translateY(0)",
                boxShadow:
                  role === r.id
                    ? `0 18px 60px ${r.color}22`
                    : "none",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "flex-start",
                  marginBottom: 18,
                }}
              >
                <div style={{ fontSize: 40 }}>{r.icon}</div>
                <div
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: role === r.id ? r.color : "transparent",
                    border: `1px solid ${
                      role === r.id ? r.color : "#314056"
                    }`,
                    boxShadow:
                      role === r.id ? `0 0 18px ${r.color}` : "none",
                  }}
                />
              </div>
              <div
                style={{
                  fontSize: 15,
                  fontWeight: "bold",
                  color: role === r.id ? r.color : "#FFF",
                  marginBottom: 10,
                }}
              >
                {r.label}
              </div>
              <div
                style={{
                  fontSize: 13,
                  color: "var(--nafsia-muted)",
                  lineHeight: 1.65,
                }}
              >
                {r.sub}
              </div>
            </div>
          ))}
        </div>

        {role ? (
          <button
            onClick={handleLogin}
            disabled={loading}
            style={{
              background: role === "patient" ? "#87f5cf" : "#7dd3fc",
              color: "#04111d",
              border: "none",
              borderRadius: 999,
              padding: "15px 30px",
              fontSize: 15,
              fontWeight: "bold",
              cursor: "pointer",
              boxShadow: "0 16px 40px rgba(125, 211, 252, 0.18)",
            }}
          >
            {loading ? "Connecting..." : "Enter"}
          </button>
        ) : null}
      </div>
    </div>
  );
}
