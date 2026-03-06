import { useState } from "react";

const MOODS = [
  { emoji: "😊", label: "Great", score: 1, color: "#00FFB2" },
  { emoji: "🙂", label: "Okay", score: 3, color: "#4DFFFF" },
  { emoji: "😐", label: "Meh", score: 5, color: "#FFDD00" },
  { emoji: "😔", label: "Low", score: 7, color: "#FF6B35" },
  { emoji: "😢", label: "Really low", score: 9, color: "#FF3CAC" },
];

export default function MoodCheckIn({ sessionId, onMoodSelected }) {
  const [selected, setSelected] = useState(null);

  return (
    <div style={{ minHeight: "100vh", background: "#05050E", display: "flex",
      flexDirection: "column", alignItems: "center", justifyContent: "center" }}>

      <div style={{ fontSize: 22, color: "#FFF", fontWeight: "bold", marginBottom: 10 }}>
        How are you feeling right now?
      </div>
      <div style={{ fontSize: 13, color: "#555", marginBottom: 48 }}>
        Take a moment. There is no wrong answer.
      </div>

      <div style={{ display: "flex", gap: 20, marginBottom: 48 }}>
        {MOODS.map((m, i) => (
          <div key={i} onClick={() => setSelected(m)}
            style={{ display: "flex", flexDirection: "column", alignItems: "center",
              gap: 10, cursor: "pointer",
              opacity: selected && selected.label !== m.label ? 0.3 : 1,
              transition: "all 0.3s",
              transform: selected?.label === m.label ? "scale(1.2)" : "scale(1)" }}>
            <div style={{ fontSize: 52,
              background: selected?.label === m.label ? m.color + "22" : "transparent",
              border: "2px solid " + (selected?.label === m.label ? m.color : "transparent"),
              borderRadius: "50%", width: 80, height: 80,
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "all 0.3s" }}>
              {m.emoji}
            </div>
            <div style={{ fontSize: 12,
              color: selected?.label === m.label ? m.color : "#666" }}>
              {m.label}
            </div>
          </div>
        ))}
      </div>

      {selected && (
        <button
          onClick={() => onMoodSelected(selected.label.toLowerCase(), selected.score)}
          style={{ background: selected.color, color: "#000", border: "none",
            borderRadius: 28, padding: "14px 48px",
            fontSize: 15, fontWeight: "bold", cursor: "pointer" }}>
          Begin Session
        </button>
      )}
    </div>
  );
}
