import { useState, useEffect, useRef } from "react";
import { socket, WS_EVENTS } from "../ws/socket";
import { analyzeMessage, sendChatMessage, triggerSOS } from "../api/nafsia";

const TIER_SURFACES = {
  safe: {
    base: "#edf4fb",
    glow: "radial-gradient(circle at top left, rgba(125, 211, 252, 0.22), transparent 24%)",
  },
  watch: {
    base: "#f8f4df",
    glow: "radial-gradient(circle at top left, rgba(244, 210, 122, 0.22), transparent 24%)",
  },
  concern: {
    base: "#faede5",
    glow: "radial-gradient(circle at top left, rgba(255, 159, 110, 0.2), transparent 24%)",
  },
  crisis: {
    base: "#f8e8ea",
    glow: "radial-gradient(circle at top left, rgba(244, 163, 190, 0.22), transparent 24%)",
  },
};

const TECHNIQUE_COLORS = {
  CBT: "#4A9EFF",
  DBT: "#FF6B35",
  MI: "#00FFB2",
  ROGERIAN: "#A855F7",
};

function deriveCurrentMood(analysis, fallbackMood) {
  if (!analysis?.emotion) return fallbackMood || "--";
  const emotion = analysis.emotion;
  if (emotion === "joy") return "great";
  if (emotion === "neutral") return "okay";
  if (emotion === "sadness") return "low";
  if (emotion === "fear") return "really low";
  if (emotion === "anger") return "low";
  return emotion;
}

function formatTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TypingIndicator() {
  return (
    <div style={styles.typingWrap}>
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          style={{
            ...styles.typingDot,
            animation: `bounce 0.9s ${dot * 0.15}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

function CopingSupport({ copingEmotion, riskTier }) {
  if (riskTier === "crisis") {
    return (
      <div style={styles.copingCard}>
        <div style={styles.copingTitle}>Immediate Support</div>
        <div style={styles.copingLine}>iCall 9152987821</div>
        <div style={styles.copingLine}>NIMHANS 080-46110007</div>
      </div>
    );
  }

  if (copingEmotion === "fear" || copingEmotion === "anxiety") {
    return (
      <div style={styles.copingCard}>
        <div style={styles.copingTitle}>5-4-3-2-1 Grounding</div>
        <div style={styles.copingLine}>5 things you can see</div>
        <div style={styles.copingLine}>4 things you can feel</div>
        <div style={styles.copingLine}>3 things you can hear</div>
        <div style={styles.copingLine}>2 things you can smell</div>
        <div style={styles.copingLine}>1 thing you can taste</div>
      </div>
    );
  }

  if (copingEmotion === "stress" || copingEmotion === "sadness") {
    return (
      <div style={styles.copingCard}>
        <div style={styles.copingTitle}>Box Breathing</div>
        <div style={styles.copingLine}>Inhale 4</div>
        <div style={styles.copingLine}>Hold 4</div>
        <div style={styles.copingLine}>Exhale 4</div>
        <div style={styles.copingLine}>Hold 4</div>
      </div>
    );
  }

  return null;
}

export default function PatientChat({ sessionId, patientMood }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [sessionMode, setSessionMode] = useState("ai");
  const [silentSignal, setSilentSignal] = useState({
    detected: false,
    reason: "",
  });
  const [showSOSOverlay, setShowSOSOverlay] = useState(false);
  const [surface, setSurface] = useState(TIER_SURFACES.safe);
  const [canDismissSOS, setCanDismissSOS] = useState(false);
  const bottomRef = useRef(null);

  function addMessage(role, content, meta = {}) {
    setMessages((current) => [
      ...current,
      {
        role,
        content,
        timestamp: formatTime(),
        emotionTag: meta.emotionTag || "",
        technique: meta.technique || "",
        techniqueColor: meta.techniqueColor || "",
        riskTier: meta.riskTier || "",
        copingEmotion: meta.copingEmotion || "",
      },
    ]);
  }

  function addSystemMessage(content) {
    addMessage("system", content);
  }

  useEffect(() => {
    socket.connectPatient(sessionId);

    const offMode = socket.on(WS_EVENTS.SESSION_MODE_CHANGED, (data) => {
      setSessionMode(data.mode || "ai");
      if (data.message) addSystemMessage(data.message);
    });

    const offCounselor = socket.on(WS_EVENTS.COUNSELOR_MESSAGE, (data) => {
      addMessage("counselor", data.content || "");
    });

    return () => {
      offMode();
      offCounselor();
      socket.disconnect();
    };
  }, [sessionId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  useEffect(() => {
    if (!showSOSOverlay) {
      setCanDismissSOS(false);
      return undefined;
    }
    const timer = setTimeout(() => setCanDismissSOS(true), 5000);
    return () => clearTimeout(timer);
  }, [showSOSOverlay]);

  async function handleSend() {
    const userMessage = input.trim();
    if (!userMessage) return;

    setInput("");
    addMessage("user", userMessage);
    setIsTyping(true);

    try {
      const analysisResult = await analyzeMessage(userMessage, sessionId);
      setAnalysis(analysisResult);
      setSurface(TIER_SURFACES[analysisResult.risk_tier?.tier] || TIER_SURFACES.safe);
      socket.send({ content: userMessage, analysis: analysisResult });

      if (analysisResult.silent_signal) {
        setSilentSignal({
          detected: true,
          reason: analysisResult.silent_signal_reason,
        });
        await new Promise((resolve) => setTimeout(resolve, 800));
        addMessage(
          "assistant",
          "I notice you have gone a bit quiet. You do not have to share anything you are not ready to. I am here."
        );
        setIsTyping(false);
        return;
      }

      setSilentSignal({ detected: false, reason: "" });

      if (sessionMode === "ai") {
        const chatResult = await sendChatMessage({
          message: userMessage,
          sessionId,
          technique: analysisResult.technique,
          emotion: analysisResult.emotion,
          riskScore: analysisResult.risk_score,
        });

        if (!chatResult.ai_silenced && chatResult.response) {
          addMessage("assistant", chatResult.response, {
            emotionTag:
              analysisResult.emotion +
              " " +
              Math.round(analysisResult.emotion_score * 100) +
              "%",
            technique: chatResult.technique,
            techniqueColor: chatResult.technique_color,
            copingEmotion: analysisResult.emotion,
            riskTier: analysisResult.risk_tier?.tier,
          });
        }
      }
    } catch (error) {
      addMessage("system", "Connection issue. Please try again in a moment.");
    } finally {
      setIsTyping(false);
    }
  }

  async function handleSOS() {
    await triggerSOS(sessionId);
    setShowSOSOverlay(true);
  }

  const currentTechnique = analysis?.technique || "ROGERIAN";
  const currentTechniqueColor =
    analysis?.technique_color ||
    TECHNIQUE_COLORS[currentTechnique] ||
    "#A855F7";
  const detectedMood = deriveCurrentMood(analysis, patientMood);

  return (
    <div
      style={{
        ...styles.page,
        backgroundColor: surface.base,
        backgroundImage: `${surface.glow}, radial-gradient(circle at top right, rgba(168, 85, 247, 0.12), transparent 20%), linear-gradient(180deg, rgba(255,255,255,0.58), rgba(255,255,255,0.38))`,
        transition: "background-color 1.5s ease",
      }}
    >
      <style>{`
        @keyframes pulse { 0%,100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.82; } }
        @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
        @media (max-width: 1080px) {
          .nafsia-patient-page { flex-direction: column; }
          .nafsia-patient-right { width: 100% !important; border-left: none !important; border-top: 1px solid rgba(76, 98, 136, 0.14); }
        }
      `}</style>

      <div style={styles.leftPane}>
        <div style={styles.header}>
          <div style={styles.headerInner}>
            <div>
              <div style={styles.brand}>NAFSIA</div>
              <div style={styles.subtleMeta}>Private patient channel</div>
            </div>

            <div
              style={{
                ...styles.techniqueBadge,
                background: currentTechniqueColor + "16",
                color: currentTechniqueColor,
              }}
            >
              {currentTechnique}
            </div>

            <div style={styles.headerActions}>
              {sessionMode === "human" ? (
                <div style={styles.modeIndicator}>Human counselor active</div>
              ) : null}
              <button onClick={handleSOS} style={styles.sosButton}>
                SOS
              </button>
            </div>
          </div>
        </div>

        {silentSignal.detected ? (
          <div style={styles.bannerWrap}>
            <div style={styles.silentBanner}>
              <span style={styles.silentDot} />
              <span>{silentSignal.reason}</span>
            </div>
          </div>
        ) : null}

        <div style={styles.messagesArea}>
          <div style={styles.messagesInner}>
            <div style={styles.introCard}>
              <div style={styles.introEyebrow}>Session in progress</div>
              <div style={styles.introTitle}>A calmer space to keep talking.</div>
              <div style={styles.introText}>
                Your conversation stays centered here while live emotional
                signals update quietly on the right.
              </div>
            </div>

            {messages.map((message, index) => {
              if (message.role === "system") {
                return (
                  <div key={index} style={styles.systemWrap}>
                    <div style={styles.systemMessage}>{message.content}</div>
                  </div>
                );
              }

              if (message.role === "user") {
                return (
                  <div key={index} style={styles.userWrap}>
                    <div style={styles.userMessage}>
                      <div>{message.content}</div>
                      <div style={styles.timestamp}>{message.timestamp}</div>
                    </div>
                  </div>
                );
              }

              if (message.role === "counselor") {
                return (
                  <div key={index} style={styles.assistantWrap}>
                    <div style={styles.counselorMessage}>
                      <div style={styles.counselorLabel}>Counselor</div>
                      <div>{message.content}</div>
                      <div style={styles.timestamp}>{message.timestamp}</div>
                    </div>
                  </div>
                );
              }

              return (
                <div key={index} style={styles.assistantWrap}>
                  <div style={styles.assistantMessage}>
                    <div>{message.content}</div>
                    <div style={styles.timestamp}>{message.timestamp}</div>
                  </div>
                  {message.emotionTag ? (
                    <div style={styles.emotionTag}>{message.emotionTag}</div>
                  ) : null}
                  <CopingSupport
                    copingEmotion={message.copingEmotion}
                    riskTier={message.riskTier}
                  />
                </div>
              );
            })}

            {isTyping ? <TypingIndicator /> : null}
            <div ref={bottomRef} />
          </div>
        </div>

        <div style={styles.inputBar}>
          <div style={styles.inputInner}>
            <input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") handleSend();
              }}
              placeholder="Share what is on your mind..."
              style={styles.input}
            />
            <button onClick={handleSend} style={styles.sendButton}>
              Send
            </button>
          </div>
        </div>
      </div>

      <div className="nafsia-patient-right" style={styles.rightPane}>
        <div style={styles.panelTitle}>Live Analysis</div>
        <div style={styles.panelItem}>
          <span style={styles.panelLabel}>Session</span>
          <span style={styles.panelValue}>{sessionId}</span>
        </div>
        <div style={styles.panelItem}>
          <span style={styles.panelLabel}>Detected Mood</span>
          <span style={styles.panelValue}>{detectedMood}</span>
        </div>
        <div style={styles.panelItem}>
          <span style={styles.panelLabel}>Baseline Mood</span>
          <span style={styles.panelValue}>{patientMood || "unknown"}</span>
        </div>
        <div style={styles.panelItem}>
          <span style={styles.panelLabel}>Risk</span>
          <span style={styles.panelValue}>
            {analysis?.risk_score ?? "--"} / {analysis?.risk_tier?.label || "--"}
          </span>
        </div>
        <div style={styles.panelItem}>
          <span style={styles.panelLabel}>Emotion</span>
          <span style={styles.panelValue}>{analysis?.emotion || "--"}</span>
        </div>
        <div style={styles.panelItem}>
          <span style={styles.panelLabel}>Velocity</span>
          <span style={styles.panelValue}>{analysis?.velocity_arrow || "--"}</span>
        </div>
        <div style={styles.panelItem}>
          <span style={styles.panelLabel}>Technique</span>
          <span style={styles.panelValue}>{analysis?.technique || "--"}</span>
        </div>
        <div style={styles.panelItem}>
          <span style={styles.panelLabel}>Detected Stress</span>
          <span style={styles.panelValue}>{analysis?.stress_label || "--"}</span>
        </div>
        <div style={styles.panelItem}>
          <span style={styles.panelLabel}>Mode</span>
          <span style={styles.panelValue}>{sessionMode}</span>
        </div>
      </div>

      {showSOSOverlay ? (
        <div style={styles.sosOverlay}>
          <div style={styles.sosHeart}>💚</div>
          <div style={styles.sosHeadline}>Help is on the way.</div>
          <div style={styles.sosText}>
            You are not alone. A counselor has been notified.
          </div>
          <div style={styles.hotline}>iCall: 9152987821</div>
          <div style={styles.hotline}>NIMHANS: 080-46110007</div>
          {canDismissSOS ? (
            <button
              onClick={() => setShowSOSOverlay(false)}
              style={styles.dismissButton}
            >
              Dismiss
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    height: "100vh",
    color: "#0F172A",
  },
  leftPane: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 20,
    padding: "18px 24px 10px",
  },
  headerInner: {
    maxWidth: 920,
    margin: "0 auto",
    background: "rgba(8, 13, 27, 0.86)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 24,
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
    boxShadow: "0 18px 48px rgba(0,0,0,0.14)",
    backdropFilter: "blur(18px)",
  },
  brand: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 20,
    letterSpacing: "-0.03em",
  },
  subtleMeta: {
    color: "rgba(214, 227, 255, 0.62)",
    fontSize: 12,
    marginTop: 4,
  },
  techniqueBadge: {
    padding: "10px 16px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: "0.06em",
    border: "1px solid rgba(255,255,255,0.06)",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  modeIndicator: {
    color: "#7dd3fc",
    fontSize: 12,
    fontWeight: "bold",
  },
  sosButton: {
    background: "linear-gradient(135deg, #ff6b6b 0%, #ff4444 100%)",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 999,
    padding: "10px 18px",
    fontWeight: "bold",
    cursor: "pointer",
    animation: "pulse 1.6s infinite",
    boxShadow: "0 12px 32px rgba(255, 68, 68, 0.2)",
  },
  bannerWrap: {
    padding: "0 24px 6px",
  },
  silentBanner: {
    maxWidth: 920,
    margin: "0 auto",
    background: "rgba(255, 166, 92, 0.14)",
    color: "#8A4A12",
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    fontWeight: 600,
    borderRadius: 20,
    border: "1px solid rgba(255, 166, 92, 0.22)",
  },
  silentDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#FFB347",
    display: "inline-block",
    animation: "pulse 1.3s infinite",
  },
  messagesArea: {
    flex: 1,
    overflowY: "auto",
    padding: "6px 24px 120px",
  },
  messagesInner: {
    maxWidth: 920,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  introCard: {
    background: "rgba(255,255,255,0.42)",
    border: "1px solid rgba(255,255,255,0.34)",
    borderRadius: 24,
    padding: "18px 20px",
    boxShadow: "0 18px 40px rgba(72, 98, 132, 0.08)",
  },
  introEyebrow: {
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
    color: "#4B647F",
    marginBottom: 8,
  },
  introTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#0B1A2E",
    marginBottom: 8,
  },
  introText: {
    color: "#465A73",
    lineHeight: 1.7,
  },
  systemWrap: {
    display: "flex",
    justifyContent: "center",
  },
  systemMessage: {
    width: "100%",
    background: "rgba(125, 211, 252, 0.18)",
    color: "#164C5B",
    textAlign: "center",
    padding: "14px 18px",
    borderRadius: 16,
    fontWeight: 600,
    border: "1px solid rgba(125, 211, 252, 0.18)",
  },
  userWrap: {
    display: "flex",
    justifyContent: "flex-end",
  },
  userMessage: {
    maxWidth: "72%",
    background: "rgba(135, 245, 207, 0.34)",
    borderRadius: "22px 22px 8px 22px",
    padding: "16px 18px",
    color: "#09372e",
    border: "1px solid rgba(135, 245, 207, 0.22)",
    boxShadow: "0 16px 36px rgba(83, 160, 136, 0.08)",
  },
  assistantWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
  },
  assistantMessage: {
    maxWidth: "78%",
    background: "rgba(18, 27, 46, 0.92)",
    color: "#FFFFFF",
    borderRadius: "22px 22px 22px 8px",
    padding: "16px 18px",
    boxShadow: "0 20px 40px rgba(6, 12, 24, 0.16)",
  },
  counselorMessage: {
    maxWidth: "78%",
    background: "rgba(125, 211, 252, 0.12)",
    color: "#0F172A",
    borderLeft: "3px solid #7dd3fc",
    borderTop: "1px solid rgba(125, 211, 252, 0.22)",
    borderRight: "1px solid rgba(125, 211, 252, 0.12)",
    borderBottom: "1px solid rgba(125, 211, 252, 0.12)",
    borderRadius: "22px 22px 22px 8px",
    padding: "16px 18px",
  },
  counselorLabel: {
    color: "#0284C7",
    fontSize: 12,
    fontWeight: "bold",
    marginBottom: 6,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  emotionTag: {
    fontSize: 12,
    color: "#5B6E88",
    marginLeft: 8,
  },
  copingCard: {
    background: "rgba(255,255,255,0.46)",
    border: "1px solid rgba(255,255,255,0.28)",
    borderRadius: 18,
    padding: "14px 16px",
    maxWidth: 320,
  },
  copingTitle: {
    fontWeight: "bold",
    marginBottom: 8,
    color: "#0F172A",
  },
  copingLine: {
    fontSize: 13,
    color: "#334155",
    marginBottom: 4,
  },
  timestamp: {
    marginTop: 8,
    fontSize: 11,
    color: "inherit",
    opacity: 0.6,
  },
  typingWrap: {
    alignSelf: "flex-start",
    background: "rgba(18, 27, 46, 0.92)",
    borderRadius: "22px 22px 22px 8px",
    padding: "16px 18px",
    display: "flex",
    gap: 6,
    boxShadow: "0 20px 40px rgba(6, 12, 24, 0.12)",
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#94A3B8",
    display: "inline-block",
  },
  inputBar: {
    position: "sticky",
    bottom: 0,
    padding: "12px 24px 20px",
    background:
      "linear-gradient(180deg, rgba(255,255,255,0), rgba(239,244,251,0.82) 35%, rgba(239,244,251,0.94) 100%)",
    backdropFilter: "blur(16px)",
  },
  inputInner: {
    maxWidth: 920,
    margin: "0 auto",
    background: "rgba(8, 13, 27, 0.88)",
    border: "1px solid rgba(255,255,255,0.05)",
    borderRadius: 26,
    padding: 12,
    display: "flex",
    gap: 12,
    boxShadow: "0 22px 44px rgba(0,0,0,0.14)",
  },
  input: {
    flex: 1,
    background: "#0D1630",
    color: "#FFFFFF",
    border: "1px solid rgba(143, 163, 196, 0.18)",
    borderRadius: 18,
    padding: "15px 16px",
    outline: "none",
    fontSize: 15,
  },
  sendButton: {
    background: "linear-gradient(135deg, #87f5cf 0%, #7dd3fc 100%)",
    color: "#04111d",
    border: "none",
    borderRadius: 18,
    padding: "0 24px",
    fontWeight: "bold",
    cursor: "pointer",
    minWidth: 110,
  },
  rightPane: {
    width: 340,
    borderLeft: "1px solid rgba(76, 98, 136, 0.14)",
    background: "rgba(8, 13, 27, 0.88)",
    color: "#FFFFFF",
    padding: "28px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    backdropFilter: "blur(18px)",
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
  },
  panelItem: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingBottom: 14,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
  },
  panelLabel: {
    color: "rgba(255,255,255,0.52)",
    fontSize: 11,
    letterSpacing: "0.12em",
    textTransform: "uppercase",
  },
  panelValue: {
    fontSize: 15,
    fontWeight: "bold",
  },
  sosOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(8, 13, 27, 0.92)",
    zIndex: 1000,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    color: "#FFFFFF",
    textAlign: "center",
    padding: 24,
  },
  sosHeart: {
    fontSize: 60,
    marginBottom: 18,
  },
  sosHeadline: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 10,
  },
  sosText: {
    color: "rgba(255,255,255,0.68)",
    marginBottom: 18,
    maxWidth: 420,
    lineHeight: 1.7,
  },
  hotline: {
    color: "#87f5cf",
    fontWeight: "bold",
    marginBottom: 8,
  },
  dismissButton: {
    marginTop: 24,
    border: "none",
    borderRadius: 999,
    padding: "12px 22px",
    fontWeight: "bold",
    background: "#FFFFFF",
    cursor: "pointer",
  },
};
