const TIER_THEMES = {
  safe: {
    label: "Open daylight",
    roomGradient:
      "radial-gradient(circle at top left, rgba(154, 226, 208, 0.28), transparent 24%), radial-gradient(circle at top right, rgba(125, 211, 252, 0.18), transparent 22%), linear-gradient(180deg, rgba(255,255,255,0.7), rgba(236,244,251,0.44))",
    shellTint: "#edf4fb",
    panelTint: "rgba(255,255,255,0.46)",
    accent: "#7dd3fc",
    haze: "rgba(255,255,255,0.3)",
  },
  watch: {
    label: "Narrowing weather",
    roomGradient:
      "radial-gradient(circle at top left, rgba(244, 210, 122, 0.24), transparent 24%), radial-gradient(circle at top right, rgba(168, 85, 247, 0.12), transparent 22%), linear-gradient(180deg, rgba(255,250,236,0.72), rgba(248,244,223,0.48))",
    shellTint: "#f8f4df",
    panelTint: "rgba(255,250,236,0.5)",
    accent: "#f4d27a",
    haze: "rgba(244,210,122,0.16)",
  },
  concern: {
    label: "Heavy atmosphere",
    roomGradient:
      "radial-gradient(circle at top left, rgba(255, 159, 110, 0.24), transparent 24%), radial-gradient(circle at top right, rgba(255, 107, 53, 0.14), transparent 24%), linear-gradient(180deg, rgba(255,245,239,0.74), rgba(250,237,229,0.5))",
    shellTint: "#faede5",
    panelTint: "rgba(255,245,239,0.5)",
    accent: "#ff9f6e",
    haze: "rgba(255,159,110,0.16)",
  },
  crisis: {
    label: "Critical focus",
    roomGradient:
      "radial-gradient(circle at top left, rgba(244, 163, 190, 0.26), transparent 24%), radial-gradient(circle at top right, rgba(255, 68, 68, 0.18), transparent 24%), linear-gradient(180deg, rgba(255,244,246,0.76), rgba(248,232,234,0.54))",
    shellTint: "#f8e8ea",
    panelTint: "rgba(255,244,246,0.52)",
    accent: "#ff6b8a",
    haze: "rgba(255,68,68,0.14)",
  },
};

const EMOTION_ACCENTS = {
  joy: "#87f5cf",
  neutral: "#7dd3fc",
  sadness: "#f4a3be",
  fear: "#ff9f6e",
  anger: "#ff6b35",
};

const MODE_TITLES = {
  ai: "Observe",
  copilot: "Co-pilot",
  human: "Take over",
};

const MOTION_MAP = {
  STABLE: 0.4,
  DECLINING: 0.7,
  FALLING: 1,
  RECOVERING: 0.45,
  IMPROVING: 0.35,
};

export function buildSceneModel(analysis, sessionMode = "ai") {
  const tier = analysis?.risk_tier?.tier || "safe";
  const theme = TIER_THEMES[tier] || TIER_THEMES.safe;
  const emotion = analysis?.emotion || "neutral";
  const accent = EMOTION_ACCENTS[emotion] || theme.accent;
  const velocityArrow = analysis?.velocity_arrow || "STABLE";
  const technique = analysis?.technique || "ROGERIAN";

  return {
    tier,
    roomGradient: theme.roomGradient,
    shellTint: theme.shellTint,
    panelTint: theme.panelTint,
    accent,
    haze: theme.haze,
    weatherLabel: theme.label,
    motion: MOTION_MAP[velocityArrow] || 0.45,
    velocityArrow,
    emotion,
    technique,
    mode: sessionMode,
    modeTitle: MODE_TITLES[sessionMode] || MODE_TITLES.ai,
    techniqueGlow:
      technique === "CBT"
        ? "#4A9EFF"
        : technique === "DBT"
          ? "#FF6B35"
          : technique === "MI"
            ? "#00FFB2"
            : "#A855F7",
  };
}

export function sessionArcLabels(events = []) {
  const hasConcern = events.some((event) =>
    ["tier_1_alert", "tier_2_alert", "tier_3_alert"].includes(event.type)
  );
  const hasSOS = events.some((event) => event.type === "sos_fired");
  const hasTakeover = events.some(
    (event) => event.type === "intervention_mode_changed" && event.mode === "human"
  );

  return [
    "You started with a baseline check-in.",
    hasConcern ? "Things became heavier as the session progressed." : "The conversation stayed relatively steady.",
    hasTakeover || hasSOS ? "Support intensified when you needed it most." : "Support adapted as your needs shifted.",
  ];
}
