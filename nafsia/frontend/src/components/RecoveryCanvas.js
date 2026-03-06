const THEMES = {
  dawn: {
    gradient:
      "linear-gradient(135deg, rgba(135,245,207,0.22), rgba(125,211,252,0.2), rgba(255,255,255,0.18))",
    accent: "#87f5cf",
  },
  grounded: {
    gradient:
      "linear-gradient(135deg, rgba(244,210,122,0.18), rgba(255,255,255,0.12), rgba(125,211,252,0.12))",
    accent: "#f4d27a",
  },
  ember: {
    gradient:
      "linear-gradient(135deg, rgba(255,159,110,0.2), rgba(244,163,190,0.16), rgba(255,255,255,0.1))",
    accent: "#ff9f6e",
  },
};

export default function RecoveryCanvas({ recovery, compact = false, dark = false }) {
  if (!recovery) return null;
  const theme = THEMES[recovery.visual_theme] || THEMES[recovery.tone] || THEMES.dawn;

  return (
    <div
      style={{
        borderRadius: 28,
        padding: compact ? 18 : 24,
        background: dark
          ? `linear-gradient(180deg, rgba(8,13,27,0.92), rgba(8,13,27,0.84)), ${theme.gradient}`
          : theme.gradient,
        border: `1px solid ${dark ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.34)"}`,
        boxShadow: dark
          ? "0 18px 46px rgba(0,0,0,0.22)"
          : "0 24px 50px rgba(44, 68, 92, 0.09)",
        color: dark ? "#fff" : "#0F172A",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 18, flexWrap: "wrap" }}>
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: dark ? "rgba(255,255,255,0.6)" : "#51657f",
              marginBottom: 8,
            }}
          >
            Recovery Canvas
          </div>
          <div style={{ fontSize: compact ? 24 : 30, fontWeight: "bold", marginBottom: 10 }}>
            {recovery.affirmation || "You kept going."}
          </div>
          <div
            style={{
              maxWidth: 540,
              lineHeight: 1.7,
              color: dark ? "rgba(255,255,255,0.8)" : "#41566f",
            }}
          >
            {recovery.session_summary}
          </div>
        </div>
        <div
          style={{
            minWidth: compact ? 180 : 220,
            padding: compact ? 14 : 16,
            borderRadius: 18,
            background: dark ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0.44)",
          }}
        >
          <div style={{ fontSize: 12, color: theme.accent, fontWeight: "bold", marginBottom: 8 }}>
            Next 24 Hours
          </div>
          <div style={{ lineHeight: 1.7, fontSize: 14 }}>
            {recovery.micro_plan || "Take one small stabilizing step today."}
          </div>
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: compact ? "1fr" : "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 14,
          marginTop: 18,
        }}
      >
        {[
          {
            title: recovery.breathing_technique_name || "Breathing",
            body: recovery.breathing_exercise,
          },
          {
            title: "Journaling Prompt",
            body: recovery.journaling_prompt,
          },
          {
            title: "What Helped",
            body: recovery.stabilizer_summary,
          },
          {
            title: recovery.resource_title || "Support Resource",
            body: recovery.resource_description,
          },
        ].map((card) => (
          <div
            key={card.title}
            style={{
              borderRadius: 18,
              padding: 16,
              background: dark ? "rgba(255,255,255,0.04)" : "rgba(255,255,255,0.46)",
            }}
          >
            <div style={{ fontWeight: "bold", marginBottom: 8 }}>{card.title}</div>
            <div style={{ lineHeight: 1.65, fontSize: 14, color: dark ? "rgba(255,255,255,0.82)" : "#42556d" }}>
              {card.body}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
