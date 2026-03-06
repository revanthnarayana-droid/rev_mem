import { useState } from "react";

const MOODS = [
  { emoji: "😊", label: "Great", score: 1, color: "#87f5cf" },
  { emoji: "🙂", label: "Okay", score: 3, color: "#7dd3fc" },
  { emoji: "😐", label: "Meh", score: 5, color: "#f4d27a" },
  { emoji: "😔", label: "Low", score: 7, color: "#ff9f6e" },
  { emoji: "😢", label: "Really low", score: 9, color: "#f4a3be" },
];

export default function MoodCheckIn({ sessionId, onMoodSelected }) {
  const [selected, setSelected] = useState(null);

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
          width: "min(1040px, 100%)",
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
            fontSize: 11,
            color: "var(--nafsia-muted)",
            letterSpacing: "0.12em",
            textTransform: "uppercase",
            marginBottom: 14,
          }}
        >
          Session {sessionId}
        </div>
        <div
          style={{
            fontSize: "clamp(2rem, 5vw, 3rem)",
            color: "#FFF",
            fontWeight: "bold",
            marginBottom: 10,
          }}
        >
          How are you feeling right now?
        </div>
        <div
          style={{
            fontSize: 15,
            color: "var(--nafsia-muted)",
            marginBottom: 42,
            maxWidth: 440,
            lineHeight: 1.7,
          }}
        >
          Take a moment. There is no wrong answer. Choose the feeling that is
          closest to your current state and NAFSIA will calibrate the session
          around it.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 18,
            marginBottom: 40,
          }}
        >
          {MOODS.map((m, i) => (
            <div
              key={i}
              onClick={() => setSelected(m)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 10,
                cursor: "pointer",
                opacity: selected && selected.label !== m.label ? 0.42 : 1,
                transition: "all 0.3s ease",
                transform:
                  selected?.label === m.label
                    ? "translateY(-4px)"
                    : "translateY(0)",
                background:
                  selected?.label === m.label
                    ? m.color + "12"
                    : "rgba(8, 14, 29, 0.58)",
                border: `1px solid ${
                  selected?.label === m.label
                    ? m.color + "88"
                    : "var(--nafsia-line)"
                }`,
                borderRadius: 24,
                padding: "24px 12px",
              }}
            >
              <div
                style={{
                  fontSize: 52,
                  background:
                    selected?.label === m.label
                      ? m.color + "22"
                      : "rgba(255,255,255,0.03)",
                  border:
                    "1px solid " +
                    (selected?.label === m.label
                      ? m.color
                      : "rgba(255,255,255,0.05)"),
                  borderRadius: "50%",
                  width: 84,
                  height: 84,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.3s ease",
                }}
              >
                {m.emoji}
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color:
                    selected?.label === m.label ? m.color : "#c8d2e5",
                }}
              >
                {m.label}
              </div>
              <div style={{ fontSize: 11, color: "var(--nafsia-muted)" }}>
                Baseline {m.score}/10
              </div>
            </div>
          ))}
        </div>

        {selected ? (
          <button
            onClick={() =>
              onMoodSelected(selected.label.toLowerCase(), selected.score)
            }
            style={{
              background: selected.color,
              color: "#04111d",
              border: "none",
              borderRadius: 999,
              padding: "15px 30px",
              fontSize: 15,
              fontWeight: "bold",
              cursor: "pointer",
              boxShadow: `0 18px 44px ${selected.color}33`,
            }}
          >
            Begin Session
          </button>
        ) : null}
      </div>
    </div>
  );
}
