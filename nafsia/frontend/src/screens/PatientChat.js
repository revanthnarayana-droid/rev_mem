import { useState, useEffect, useRef } from "react";
import { socket, WS_EVENTS } from "../ws/socket";
import { analyzeMessage, sendChatMessage, triggerSOS } from "../api/nafsia";

const TIER_BACKGROUNDS = {
  safe: "#FFFFFF",
  watch: "#FFFDE7",
  concern: "#FFF3E0",
  crisis: "#FFEBEE",
};

const TECHNIQUE_COLORS = {
  CBT: "#4A9EFF",
  DBT: "#FF6B35",
  MI: "#00FFB2",
  ROGERIAN: "#A855F7",
};

function formatTime() {
  return new Date().toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TypingIndicator() {
  return (
    <div
      style={{
        alignSelf: "flex-start",
        background: "#1A1A2E",
        borderRadius: "18px 18px 18px 4px",
        padding: "14px 16px",
        display: "flex",
        gap: 6,
      }}
    >
      {[0, 1, 2].map((dot) => (
        <span
          key={dot}
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: "#94A3B8",
            animation: `bounce 0.9s ${dot * 0.15}s infinite`,
            display: "inline-block",
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
  const [silentSignal, setSilentSignal] = useState({ detected: false, reason: "" });
  const [showSOSOverlay, setShowSOSOverlay] = useState(false);
  const [bgColor, setBgColor] = useState(TIER_BACKGROUNDS.safe);
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
      setBgColor(TIER_BACKGROUNDS[analysisResult.risk_tier?.tier] || TIER_BACKGROUNDS.safe);
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
      addMessage(
        "system",
        "Connection issue. Please try again in a moment."
      );
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
    analysis?.technique_color || TECHNIQUE_COLORS[currentTechnique] || "#A855F7";

  return (
    <div
      style={{
        ...styles.page,
        backgroundColor: bgColor,
        transition: "background-color 1.5s ease",
      }}
    >
      <style>{`
        @keyframes pulse { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }
        @keyframes bounce { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
      `}</style>

      <div style={styles.leftPane}>
        <div style={styles.header}>
          <div style={styles.brand}>NAFSIA</div>
          <div
            style={{
              ...styles.techniqueBadge,
              background: currentTechniqueColor + "22",
              color: currentTechniqueColor,
            }}
          >
            {currentTechnique}
          </div>
          <div style={styles.headerActions}>
            {sessionMode === "human" ? (
              <div style={styles.modeIndicator}>Human counselor active</div>
            ) : null}
            <button
              onClick={handleSOS}
              style={styles.sosButton}
            >
              SOS
            </button>
          </div>
        </div>

        {silentSignal.detected ? (
          <div style={styles.silentBanner}>
            <span style={styles.silentDot} />
            <span>{silentSignal.reason}</span>
          </div>
        ) : null}

        <div style={styles.messagesArea}>
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

        <div style={styles.inputBar}>
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

      <div style={styles.rightPane}>
        <div style={styles.panelTitle}>Live Analysis</div>
        <div style={styles.panelItem}>
          <span style={styles.panelLabel}>Session</span>
          <span style={styles.panelValue}>{sessionId}</span>
        </div>
        <div style={styles.panelItem}>
          <span style={styles.panelLabel}>Mood</span>
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
          <span style={styles.panelLabel}>Stress</span>
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
    position: "relative",
  },
  rightPane: {
    width: 340,
    borderLeft: "1px solid #111128",
    background: "#0D0D22",
    color: "#FFFFFF",
    padding: "28px 22px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  },
  header: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 340,
    height: 72,
    background: "#0D0D22",
    padding: "12px 20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 20,
    boxSizing: "border-box",
  },
  brand: {
    color: "#FFFFFF",
    fontWeight: "bold",
    fontSize: 22,
  },
  techniqueBadge: {
    padding: "10px 16px",
    borderRadius: 999,
    fontSize: 13,
    fontWeight: "bold",
    letterSpacing: "0.06em",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  modeIndicator: {
    color: "#4DFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  sosButton: {
    background: "#FF4444",
    color: "#FFFFFF",
    border: "none",
    borderRadius: 999,
    padding: "10px 18px",
    fontWeight: "bold",
    cursor: "pointer",
    animation: "pulse 1.6s infinite",
  },
  silentBanner: {
    marginTop: 72,
    background: "#FF6B3522",
    color: "#8A3B11",
    padding: "14px 20px",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 14,
    fontWeight: 600,
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
    padding: "100px 20px 110px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    boxSizing: "border-box",
  },
  systemWrap: {
    display: "flex",
    justifyContent: "center",
  },
  systemMessage: {
    background: "#4DFFFF22",
    color: "#0B4F59",
    width: "100%",
    textAlign: "center",
    padding: "14px 18px",
    borderRadius: 16,
    fontWeight: 600,
  },
  userWrap: {
    display: "flex",
    justifyContent: "flex-end",
  },
  userMessage: {
    maxWidth: "72%",
    background: "#00FFB222",
    borderRadius: "18px 18px 4px 18px",
    padding: "14px 16px",
    color: "#063B2D",
  },
  assistantWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 8,
  },
  assistantMessage: {
    maxWidth: "72%",
    background: "#1A1A2E",
    color: "#F8FAFC",
    borderRadius: "18px 18px 18px 4px",
    padding: "14px 16px",
  },
  counselorMessage: {
    maxWidth: "72%",
    background: "#4DFFFF11",
    color: "#0D3B45",
    borderLeft: "4px solid #4DFFFF",
    borderRadius: "18px 18px 18px 4px",
    padding: "14px 16px",
  },
  counselorLabel: {
    color: "#0891B2",
    fontSize: 11,
    fontWeight: "bold",
    marginBottom: 6,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  emotionTag: {
    color: "#64748B",
    fontSize: 12,
    marginLeft: 6,
  },
  copingCard: {
    background: "#FFFFFFCC",
    border: "1px solid #E2E8F0",
    borderRadius: 16,
    padding: "12px 14px",
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
  inputBar: {
    position: "fixed",
    left: 0,
    right: 340,
    bottom: 0,
    background: "#0D0D22",
    padding: 16,
    display: "flex",
    gap: 12,
    boxSizing: "border-box",
    zIndex: 20,
  },
  input: {
    flex: 1,
    background: "#151530",
    color: "#FFFFFF",
    border: "1px solid #232347",
    borderRadius: 16,
    padding: "14px 16px",
    outline: "none",
    fontSize: 15,
  },
  sendButton: {
    background: "#00FFB2",
    color: "#000000",
    border: "none",
    borderRadius: 16,
    padding: "0 22px",
    fontWeight: "bold",
    cursor: "pointer",
  },
  panelTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 10,
  },
  panelItem: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    paddingBottom: 12,
    borderBottom: "1px solid #1F1F3B",
  },
  panelLabel: {
    fontSize: 11,
    color: "#94A3B8",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  panelValue: {
    fontSize: 17,
    fontWeight: 600,
    color: "#FFFFFF",
  },
  sosOverlay: {
    position: "fixed",
    inset: 0,
    background: "#0D0D22EE",
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
    marginBottom: 16,
  },
  sosHeadline: {
    fontSize: 28,
    fontWeight: "bold",
    marginBottom: 12,
  },
  sosText: {
    color: "#94A3B8",
    marginBottom: 18,
    maxWidth: 420,
    lineHeight: 1.6,
  },
  hotline: {
    color: "#00FFB2",
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 8,
  },
  dismissButton: {
    marginTop: 24,
    background: "#FFFFFF",
    color: "#0D0D22",
    border: "none",
    borderRadius: 999,
    padding: "12px 24px",
    fontWeight: "bold",
    cursor: "pointer",
  },
};
