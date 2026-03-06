import { useState, useEffect, useRef } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { socket, WS_EVENTS } from "../ws/socket";
import { generateSOAP, generateRecovery } from "../api/nafsia";

const TIER_COLORS = {
  safe: "#00FFB2",
  watch: "#FFDD00",
  concern: "#FF6B35",
  crisis: "#FF4444",
};

const TECHNIQUE_COLORS = {
  CBT: "#4A9EFF",
  DBT: "#FF6B35",
  MI: "#00FFB2",
  ROGERIAN: "#A855F7",
};

const ALERT_SEVERITY_COLORS = {
  watch: "#FFDD00",
  concern: "#FF6B35",
  crisis: "#FF4444",
  emergency: "#FF0000",
  silent: "#A855F7",
};

function getSessionTier(session) {
  return session?.analysis?.risk_tier?.tier || "safe";
}

function getVelocityArrow(session) {
  return session?.analysis?.velocity_arrow || "STABLE";
}

function updateAnalysisState(prev, data) {
  const sid = data.session_id;
  const current = prev[sid] || {
    session_id: sid,
    patient_mood: "unknown",
    messages: [],
    scoreHistory: [],
    analysis: null,
    mode: "ai",
  };
  const riskScore = data.analysis?.risk_score ?? 0;
  const nextPoint = {
    msg: current.scoreHistory.length + 1,
    score: riskScore,
    velocity: data.analysis?.velocity ?? 0,
  };

  return {
    ...prev,
    [sid]: {
      ...current,
      analysis: data.analysis,
      scoreHistory: [...current.scoreHistory, nextPoint],
    },
  };
}

function messageTier(message) {
  return message?.analysis?.risk_tier?.tier || "safe";
}

function distortionsFromMessage(message) {
  return (
    message?.analysis?.psycho_profile?.cognitive_distortions ||
    message?.analysis?.cognitive_distortions ||
    []
  );
}

export default function CounselorDashboard({ counselorSessionId }) {
  const [sessions, setSessions] = useState({});
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [soapNote, setSoapNote] = useState(null);
  const alarmContextRef = useRef(null);
  const alarmIntervalRef = useRef(null);
  const alarmTimeoutRef = useRef(null);

  function stopEmergencyAlarm() {
    if (alarmIntervalRef.current) {
      clearInterval(alarmIntervalRef.current);
      alarmIntervalRef.current = null;
    }
    if (alarmTimeoutRef.current) {
      clearTimeout(alarmTimeoutRef.current);
      alarmTimeoutRef.current = null;
    }
  }

  function beepOnce(context, startAt, duration, frequency) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "square";
    oscillator.frequency.setValueAtTime(frequency, startAt);
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.exponentialRampToValueAtTime(0.22, startAt + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startAt);
    oscillator.stop(startAt + duration + 0.02);
  }

  async function playEmergencyAlarm() {
    stopEmergencyAlarm();
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    if (!alarmContextRef.current) {
      alarmContextRef.current = new AudioCtx();
    }

    const context = alarmContextRef.current;
    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch (error) {
        console.error("[NAFSIA] Unable to resume audio context", error);
        return;
      }
    }

    const triggerPattern = () => {
      const now = context.currentTime;
      beepOnce(context, now, 0.18, 880);
      beepOnce(context, now + 0.24, 0.18, 660);
      beepOnce(context, now + 0.48, 0.18, 880);
    };

    triggerPattern();
    alarmIntervalRef.current = setInterval(triggerPattern, 1100);
    alarmTimeoutRef.current = setTimeout(() => {
      stopEmergencyAlarm();
    }, 10000);
  }

  function addAlert(data, severity) {
    setAlerts((current) =>
      [
        {
          id: Date.now() + Math.random(),
          session_id: data.session_id,
          severity,
          reason: data.alert_reason || data.reason || "Alert received",
          timestamp: new Date().toLocaleTimeString(),
          preview: data.message_preview || "",
        },
        ...current,
      ].slice(0, 30)
    );
  }

  function updateAnalysis(data) {
    setSessions((current) => updateAnalysisState(current, data));
  }

  useEffect(() => {
    socket.connectCounselorHub();

    const offStarted = socket.on(WS_EVENTS.SESSION_STARTED, (data) => {
      setSessions((current) => ({
        ...current,
        [data.session_id]: current[data.session_id] || {
          session_id: data.session_id,
          patient_mood: data.patient_mood || "unknown",
          messages: [],
          scoreHistory: [],
          analysis: null,
          mode: "ai",
          ended: false,
        },
      }));
      setActiveSessionId((current) => current || data.session_id);
    });

    const offNewMessage = socket.on(WS_EVENTS.NEW_MESSAGE, (data) => {
      setSessions((current) => {
        const session = current[data.session_id] || {
          session_id: data.session_id,
          patient_mood: "unknown",
          messages: [],
          scoreHistory: [],
          analysis: null,
          mode: "ai",
          ended: false,
        };
        return {
          ...current,
          [data.session_id]: {
            ...session,
            messages: [
              ...session.messages,
              {
                role: data.role,
                content: data.content,
                analysis: data.analysis || null,
              },
            ],
          },
        };
      });
    });

    const offAnalysis = socket.on(WS_EVENTS.ANALYSIS_UPDATE, updateAnalysis);
    const offAlert1 = socket.on(WS_EVENTS.ALERT_TIER1, (data) => {
      updateAnalysis(data);
      addAlert(data, "watch");
    });
    const offAlert2 = socket.on(WS_EVENTS.ALERT_TIER2, (data) => {
      updateAnalysis(data);
      addAlert(data, "concern");
    });
    const offAlert3 = socket.on(WS_EVENTS.ALERT_TIER3, (data) => {
      updateAnalysis(data);
      addAlert(data, "crisis");
      setActiveSessionId(data.session_id);
    });
    const offSilent = socket.on(WS_EVENTS.SILENT_SIGNAL, (data) => {
      addAlert(
        { session_id: data.session_id, alert_reason: data.reason, message_preview: "" },
        "silent"
      );
    });
    const offSOS = socket.on(WS_EVENTS.SOS_FIRED, (data) => {
      addAlert(data, "emergency");
      playEmergencyAlarm();
      document.body.style.background = "#FF000022";
      setTimeout(() => {
        document.body.style.background = "";
      }, 3000);
    });
    const offSoap = socket.on(WS_EVENTS.SOAP_READY, (data) => {
      setSoapNote(data.soap);
    });
    const offEnded = socket.on(WS_EVENTS.SESSION_ENDED, (data) => {
      setSessions((current) => ({
        ...current,
        [data.session_id]: {
          ...(current[data.session_id] || {
            session_id: data.session_id,
            patient_mood: "unknown",
            messages: [],
            scoreHistory: [],
            analysis: null,
            mode: "ai",
          }),
          ended: true,
        },
      }));
    });

    return () => {
      offStarted();
      offNewMessage();
      offAnalysis();
      offAlert1();
      offAlert2();
      offAlert3();
      offSilent();
      offSOS();
      offSoap();
      offEnded();
      stopEmergencyAlarm();
      socket.disconnect();
    };
  }, []);

  const sessionList = Object.values(sessions);
  const activeSession = activeSessionId ? sessions[activeSessionId] : null;

  function patchSession(sessionId, patch) {
    setSessions((current) => ({
      ...current,
      [sessionId]: {
        ...(current[sessionId] || {
          session_id: sessionId,
          patient_mood: "unknown",
          messages: [],
          scoreHistory: [],
          analysis: null,
          mode: "ai",
        }),
        ...patch,
      },
    }));
  }

  function handleJoinSession(sessionId) {
    socket.send({ type: "counselor_joined", session_id: sessionId });
    patchSession(sessionId, { mode: "human" });
    setActiveSessionId(sessionId);
  }

  function handleLeaveSession(sessionId) {
    socket.send({ type: "counselor_left", session_id: sessionId });
    patchSession(sessionId, { mode: "ai" });
  }

  async function handleEndSession(sessionId) {
    await generateSOAP(sessionId);
    await generateRecovery(sessionId);
  }

  return (
    <div style={styles.page}>
      <div style={styles.leftColumn}>
        <div style={styles.columnHeader}>
          <div>LIVE SESSIONS</div>
          <div style={styles.headerCount}>{sessionList.length}</div>
        </div>
        <div style={styles.sessionList}>
          {sessionList.map((session) => {
            const tier = getSessionTier(session);
            const tierColor = TIER_COLORS[tier] || TIER_COLORS.safe;
            return (
              <button
                key={session.session_id}
                onClick={() => setActiveSessionId(session.session_id)}
                style={{
                  ...styles.sessionCard,
                  borderLeft: `4px solid ${
                    activeSessionId === session.session_id ? tierColor : "#111128"
                  }`,
                  opacity: session.ended ? 0.6 : 1,
                }}
              >
                <div style={styles.sessionId}>{session.session_id}</div>
                <div style={styles.sessionMood}>{session.patient_mood || "unknown"}</div>
                <div style={{ ...styles.sessionRisk, color: tierColor }}>
                  {session.analysis?.risk_score ?? "--"} {getVelocityArrow(session)}
                </div>
                <div style={{ ...styles.sessionTier, color: tierColor }}>
                  {tier.toUpperCase()}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={styles.centerColumn}>
        <div style={styles.ekgSection}>
          <div style={styles.sectionLabel}>LIVE EMOTIONAL EKG</div>
          {activeSession?.scoreHistory?.length ? (
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={activeSession.scoreHistory}>
                <XAxis dataKey="msg" stroke="#64748B" />
                <YAxis domain={[0, 10]} stroke="#64748B" />
                <Tooltip />
                <ReferenceLine y={7.5} stroke="#FF4444" strokeDasharray="6 4" label="Crisis" />
                <ReferenceLine y={4.0} stroke="#FFDD00" strokeDasharray="6 4" label="Watch" />
                <Line dataKey="score" stroke="#FF3CAC" strokeWidth={2} dot={{ r: 3 }} />
                <Line dataKey="velocity" stroke="#4DFFFF" strokeWidth={1} strokeDasharray="3 3" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div style={styles.emptyEKG}>
              EKG will appear when patient sends first message
            </div>
          )}
        </div>

        <div style={styles.controlsRow}>
          <div style={styles.controlsMeta}>
            <span>Session: {activeSession?.session_id || "--"}</span>
            <span style={{ color: activeSession?.mode === "human" ? "#7dd3fc" : "#94A3B8" }}>
              {activeSession?.mode === "human" ? "Human counselor" : "AI mode"}
            </span>
          </div>
          <div style={styles.controlButtons}>
            <button
              style={styles.actionButton}
              disabled={!activeSession}
              onClick={() => activeSession && handleJoinSession(activeSession.session_id)}
            >
              Join Session
            </button>
            <button
              style={styles.actionButton}
              disabled={!activeSession}
              onClick={() => activeSession && handleLeaveSession(activeSession.session_id)}
            >
              Hand back to AI
            </button>
            <button
              style={{ ...styles.actionButton, background: "#8b5cf6", color: "#FFFFFF" }}
              disabled={!activeSession}
              onClick={() => activeSession && handleEndSession(activeSession.session_id)}
            >
              End+SOAP
            </button>
          </div>
        </div>

        <div style={styles.conversationFeed}>
          {(activeSession?.messages || []).map((message, index) => {
            const tier = messageTier(message);
            const tierColor = TIER_COLORS[tier] || TIER_COLORS.safe;
            const distortions = distortionsFromMessage(message);
            return (
              <div
                key={`${message.role}-${index}`}
                style={{
                  ...styles.feedMessage,
                  borderLeft: `3px solid ${tierColor}`,
                  background: `${tierColor}22`,
                }}
              >
                <div style={styles.feedTopRow}>
                  <span style={{ ...styles.feedRole, color: tierColor }}>{message.role}</span>
                  {message.role === "patient" && message.analysis?.risk_score != null ? (
                    <span style={styles.feedRisk}>{message.analysis.risk_score}</span>
                  ) : null}
                </div>
                <div style={styles.feedContent}>{message.content}</div>
                {distortions.length ? (
                  <div style={styles.distortionRow}>
                    {distortions.map((tag) => (
                      <span key={tag} style={styles.distortionTag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        {soapNote ? (
          <div style={styles.soapSection}>
            <div style={styles.soapLabel}>SOAP NOTE GENERATED</div>
            {["subjective", "objective", "assessment", "plan"].map((key) => (
              <div key={key} style={styles.soapBlock}>
                <div style={styles.soapHeading}>{key.toUpperCase()}</div>
                <div style={styles.soapText}>{soapNote[key]}</div>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div style={styles.rightColumn}>
        <div style={styles.columnHeader}>ALERT LOG</div>
        <div style={styles.alertList}>
          {alerts.map((alert) => {
            const color = ALERT_SEVERITY_COLORS[alert.severity] || "#94A3B8";
            return (
              <div
                key={alert.id}
                style={{ ...styles.alertCard, borderLeft: `4px solid ${color}` }}
              >
                <div style={styles.alertHeader}>
                  <span style={{ ...styles.alertBadge, background: color }}>
                    {alert.severity}
                  </span>
                  <span style={styles.alertTime}>{alert.timestamp}</span>
                </div>
                <div style={styles.alertReason}>{alert.reason}</div>
                {alert.preview ? (
                  <div style={styles.alertPreview}>{alert.preview}</div>
                ) : null}
                <div style={styles.alertSession}>{alert.session_id}</div>
              </div>
            );
          })}
        </div>

        {activeSession?.analysis ? (
          <div style={styles.miniPanel}>
            <div style={styles.sectionLabel}>LIVE ANALYSIS</div>
            <div
              style={{
                ...styles.miniRisk,
                color: TIER_COLORS[activeSession.analysis.risk_tier?.tier] || "#FFFFFF",
              }}
            >
              {activeSession.analysis.risk_score}
            </div>
            <div style={styles.miniItem}>Emotion: {activeSession.analysis.emotion}</div>
            <div style={styles.miniItem}>Velocity: {activeSession.analysis.velocity_arrow}</div>
            <div
              style={{
                ...styles.miniItem,
                color: TECHNIQUE_COLORS[activeSession.analysis.technique] || "#FFFFFF",
              }}
            >
              Technique: {activeSession.analysis.technique}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    height: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(125, 211, 252, 0.08), transparent 22%), linear-gradient(180deg, #060a14 0%, #090f1d 100%)",
    color: "#FFFFFF",
    fontFamily: "monospace",
  },
  leftColumn: {
    width: 240,
    borderRight: "1px solid rgba(143, 163, 196, 0.12)",
    background: "rgba(8, 13, 27, 0.78)",
    display: "flex",
    flexDirection: "column",
    backdropFilter: "blur(18px)",
  },
  centerColumn: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  rightColumn: {
    width: 280,
    borderLeft: "1px solid rgba(143, 163, 196, 0.12)",
    background: "rgba(8, 13, 27, 0.78)",
    display: "flex",
    flexDirection: "column",
    backdropFilter: "blur(18px)",
  },
  columnHeader: {
    padding: "18px 16px",
    borderBottom: "1px solid rgba(143, 163, 196, 0.12)",
    fontWeight: "bold",
    letterSpacing: "0.08em",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerCount: {
    color: "#7dd3fc",
  },
  sessionList: {
    overflowY: "auto",
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  sessionCard: {
    background: "rgba(15, 21, 38, 0.82)",
    border: "1px solid rgba(143, 163, 196, 0.12)",
    color: "#FFFFFF",
    padding: 14,
    textAlign: "left",
    cursor: "pointer",
    borderRadius: 18,
    boxShadow: "0 14px 36px rgba(0, 0, 0, 0.16)",
  },
  sessionId: {
    fontWeight: "bold",
    marginBottom: 6,
  },
  sessionMood: {
    color: "#94A3B8",
    fontSize: 12,
    marginBottom: 8,
  },
  sessionRisk: {
    fontWeight: "bold",
    marginBottom: 4,
  },
  sessionTier: {
    fontSize: 12,
    letterSpacing: "0.08em",
  },
  ekgSection: {
    background: "rgba(11, 17, 31, 0.82)",
    borderBottom: "1px solid rgba(143, 163, 196, 0.12)",
    padding: 16,
    minHeight: 210,
    backdropFilter: "blur(18px)",
  },
  sectionLabel: {
    color: "#94A3B8",
    fontSize: 12,
    letterSpacing: "0.08em",
    marginBottom: 12,
  },
  emptyEKG: {
    height: 160,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#475569",
  },
  controlsRow: {
    background: "rgba(11, 17, 31, 0.82)",
    borderBottom: "1px solid rgba(143, 163, 196, 0.12)",
    padding: "10px 16px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  controlsMeta: {
    display: "flex",
    gap: 16,
    fontSize: 12,
    color: "#E2E8F0",
    flexWrap: "wrap",
  },
  controlButtons: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  actionButton: {
    background: "rgba(20, 28, 48, 0.96)",
    color: "#FFFFFF",
    border: "1px solid rgba(143, 163, 196, 0.14)",
    padding: "8px 12px",
    cursor: "pointer",
    borderRadius: 14,
  },
  conversationFeed: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: 0,
  },
  feedMessage: {
    padding: 14,
    borderRadius: 18,
    boxShadow: "0 14px 34px rgba(0, 0, 0, 0.12)",
  },
  feedTopRow: {
    display: "flex",
    justifyContent: "space-between",
    marginBottom: 8,
    alignItems: "center",
  },
  feedRole: {
    textTransform: "uppercase",
    fontSize: 11,
    letterSpacing: "0.08em",
    fontWeight: "bold",
  },
  feedRisk: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  feedContent: {
    color: "#E2E8F0",
    lineHeight: 1.6,
  },
  distortionRow: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 10,
  },
  distortionTag: {
    background: "#FF444422",
    color: "#FF6666",
    border: "1px solid #FF444444",
    fontSize: 11,
    padding: "4px 6px",
    borderRadius: 999,
  },
  soapSection: {
    borderTop: "1px solid rgba(197, 163, 255, 0.45)",
    padding: 16,
    background: "rgba(11, 17, 31, 0.82)",
    maxHeight: 280,
    overflowY: "auto",
  },
  soapLabel: {
    color: "#C084FC",
    fontWeight: "bold",
    marginBottom: 12,
  },
  soapBlock: {
    marginBottom: 12,
  },
  soapHeading: {
    fontSize: 12,
    color: "#E879F9",
    marginBottom: 6,
  },
  soapText: {
    color: "#E2E8F0",
    lineHeight: 1.5,
    fontSize: 13,
  },
  alertList: {
    flex: 1,
    overflowY: "auto",
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  alertCard: {
    background: "rgba(15, 21, 38, 0.82)",
    padding: 12,
    borderRadius: 16,
    boxShadow: "0 12px 30px rgba(0, 0, 0, 0.14)",
  },
  alertHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  alertBadge: {
    color: "#000000",
    fontSize: 11,
    fontWeight: "bold",
    padding: "3px 6px",
    textTransform: "uppercase",
    borderRadius: 999,
  },
  alertTime: {
    color: "#94A3B8",
    fontSize: 11,
  },
  alertReason: {
    color: "#FFFFFF",
    lineHeight: 1.4,
    marginBottom: 6,
  },
  alertPreview: {
    color: "#94A3B8",
    fontStyle: "italic",
    fontSize: 12,
    marginBottom: 6,
  },
  alertSession: {
    color: "#7dd3fc",
    fontSize: 12,
  },
  miniPanel: {
    borderTop: "1px solid rgba(143, 163, 196, 0.12)",
    padding: 16,
  },
  miniRisk: {
    fontSize: 32,
    fontWeight: "bold",
    marginBottom: 10,
  },
  miniItem: {
    color: "#E2E8F0",
    marginBottom: 8,
  },
};
