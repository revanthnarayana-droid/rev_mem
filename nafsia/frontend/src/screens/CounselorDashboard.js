import { useState, useEffect, useRef } from "react";
import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { socket, WS_EVENTS } from "../ws/socket";
import { generateSOAP, generateRecovery, sendChatMessage } from "../api/nafsia";
import { buildSceneModel } from "../utils/sceneModel";
import RecoveryCanvas from "../components/RecoveryCanvas";

const TIER_COLORS = {
  safe: "#00FFB2",
  watch: "#FFDD00",
  concern: "#FF6B35",
  crisis: "#FF4444",
};

const ALERT_SEVERITY_COLORS = {
  watch: "#FFDD00",
  concern: "#FF6B35",
  crisis: "#FF4444",
  emergency: "#FF0000",
  silent: "#A855F7",
};

function ensureSession(current, sid, patch = {}) {
  return current[sid] || {
    session_id: sid,
    patient_mood: "unknown",
    baseline_score: 5,
    messages: [],
    scoreHistory: [],
    analysis: null,
    mode: "ai",
    ended: false,
    timelineEvents: [],
    recovery: null,
    copilotDrafts: [],
    ...patch,
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

function mergeTimelineEvents(current, incoming) {
  const merged = [...current];
  for (const event of incoming) {
    if (!event?.id) continue;
    if (merged.some((item) => item.id === event.id)) continue;
    merged.push(event);
  }
  return merged.sort(
    (left, right) => new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime()
  );
}

function eventToMessageIndex(session, event) {
  if (!session || !event) return -1;
  const messages = session.messages || [];
  if (!messages.length) return -1;

  const riskTypes = new Set(["first_spike", "tier_1_alert", "tier_2_alert", "tier_3_alert", "silent_signal"]);
  if (riskTypes.has(event.type)) {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role !== "patient") continue;
      if (event.score != null && message.analysis?.risk_score === event.score) {
        return index;
      }
      if (message.timestamp && event.timestamp) {
        const delta = Math.abs(
          new Date(message.timestamp).getTime() - new Date(event.timestamp).getTime()
        );
        if (delta < 8000) {
          return index;
        }
      }
    }
  }

  if (event.type === "intervention_mode_changed") {
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      if (message.role === "counselor" || message.role === "assistant") {
        return index;
      }
    }
  }

  return -1;
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const scorePoint = payload.find((item) => item.dataKey === "score");
  const velocityPoint = payload.find((item) => item.dataKey === "velocity");
  return (
    <div
      style={{
        background: "rgba(8, 13, 27, 0.94)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: "12px 14px",
        boxShadow: "0 18px 34px rgba(0,0,0,0.26)",
      }}
    >
      <div style={{ color: "#8ea0bf", fontSize: 11, marginBottom: 8 }}>Message {label}</div>
      {scorePoint ? (
        <div style={{ color: "#ff62bd", fontWeight: "bold", marginBottom: 4 }}>
          Score: {scorePoint.value}
        </div>
      ) : null}
      {velocityPoint ? (
        <div style={{ color: "#67e8f9", fontWeight: "bold" }}>
          Velocity: {velocityPoint.value}
        </div>
      ) : null}
    </div>
  );
}

export default function CounselorDashboard() {
  const [sessions, setSessions] = useState({});
  const [activeSessionId, setActiveSessionId] = useState(null);
  const [alerts, setAlerts] = useState([]);
  const [soapNote, setSoapNote] = useState(null);
  const [focusedTimelineEvent, setFocusedTimelineEvent] = useState(null);
  const [counselorInput, setCounselorInput] = useState("");
  const [focusedMessageIndex, setFocusedMessageIndex] = useState(-1);
  const sessionsRef = useRef({});
  const alarmContextRef = useRef(null);
  const alarmIntervalRef = useRef(null);
  const alarmTimeoutRef = useRef(null);
  const messageRefs = useRef({});

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

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
    alarmTimeoutRef.current = setTimeout(stopEmergencyAlarm, 10000);
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

  useEffect(() => {
    socket.connectCounselorHub();

    const offStarted = socket.on(WS_EVENTS.SESSION_STARTED, (data) => {
      setSessions((current) => ({
        ...current,
        [data.session_id]: ensureSession(current, data.session_id, {
          patient_mood: data.patient_mood || "unknown",
          baseline_score: data.baseline_score || 5,
        }),
      }));
      setActiveSessionId((current) => current || data.session_id);
    });

    const offMode = socket.on(WS_EVENTS.SESSION_MODE_CHANGED, (data) => {
      if (!data.session_id) return;
      setSessions((current) => ({
        ...current,
        [data.session_id]: {
          ...ensureSession(current, data.session_id),
          mode: data.mode || "ai",
        },
      }));
    });
    const offJoined = socket.on(WS_EVENTS.COUNSELOR_JOINED, (data) => {
      if (!data.session_id) return;
      setSessions((current) => ({
        ...current,
        [data.session_id]: {
          ...ensureSession(current, data.session_id),
          mode: data.mode || "human",
        },
      }));
    });
    const offLeft = socket.on(WS_EVENTS.COUNSELOR_LEFT, (data) => {
      if (!data.session_id) return;
      setSessions((current) => ({
        ...current,
        [data.session_id]: {
          ...ensureSession(current, data.session_id),
          mode: "ai",
        },
      }));
    });

    const offNewMessage = socket.on(WS_EVENTS.NEW_MESSAGE, async (data) => {
      setSessions((current) => {
        const session = ensureSession(current, data.session_id);
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
                timestamp: data.timestamp || new Date().toISOString(),
              },
            ],
          },
        };
      });

      const session = sessionsRef.current[data.session_id];
      const mode = session?.mode || "ai";
      if (data.role === "patient" && mode === "copilot" && data.analysis) {
        try {
          await sendChatMessage({
            message: data.content,
            sessionId: data.session_id,
            technique: data.analysis.technique,
            emotion: data.analysis.emotion,
            riskScore: data.analysis.risk_score,
            draftOnly: true,
            audience: "counselor",
          });
        } catch (error) {
          console.error("[NAFSIA] Copilot draft failed", error);
        }
      }
    });

    const offAnalysis = socket.on(WS_EVENTS.ANALYSIS_UPDATE, (data) => {
      setSessions((current) => {
        const session = ensureSession(current, data.session_id);
        const riskScore = data.analysis?.risk_score ?? 0;
        return {
          ...current,
          [data.session_id]: {
            ...session,
            analysis: data.analysis,
            scoreHistory: [
              ...session.scoreHistory,
              {
                msg: session.scoreHistory.length + 1,
                score: riskScore,
                velocity: data.analysis?.velocity ?? 0,
                timestamp: data.analysis?.timestamp || new Date().toISOString(),
              },
            ],
          },
        };
      });
    });

    const offAlert1 = socket.on(WS_EVENTS.ALERT_TIER1, (data) => addAlert(data, "watch"));
    const offAlert2 = socket.on(WS_EVENTS.ALERT_TIER2, (data) => addAlert(data, "concern"));
    const offAlert3 = socket.on(WS_EVENTS.ALERT_TIER3, (data) => {
      addAlert(data, "crisis");
      setActiveSessionId(data.session_id);
    });
    const offSilent = socket.on(WS_EVENTS.SILENT_SIGNAL, (data) => {
      addAlert({ session_id: data.session_id, alert_reason: data.reason }, "silent");
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
      setActiveSessionId(data.session_id);
    });
    const offRecovery = socket.on(WS_EVENTS.RECOVERY_READY, (data) => {
      setSessions((current) => ({
        ...current,
        [data.session_id]: {
          ...ensureSession(current, data.session_id),
          recovery: data.recovery,
        },
      }));
    });
    const offTimeline = socket.on(WS_EVENTS.TIMELINE_EVENT, (data) => {
      if (!data.event) return;
      setSessions((current) => {
        const session = ensureSession(current, data.session_id);
        return {
          ...current,
          [data.session_id]: {
            ...session,
            timelineEvents: mergeTimelineEvents(session.timelineEvents, [data.event]),
          },
        };
      });
    });
    const offDraft = socket.on(WS_EVENTS.COPILOT_DRAFT_READY, (data) => {
      setSessions((current) => {
        const session = ensureSession(current, data.session_id);
        return {
          ...current,
          [data.session_id]: {
            ...session,
            copilotDrafts: [data.draft, ...session.copilotDrafts].slice(0, 4),
          },
        };
      });
    });
    const offEnded = socket.on(WS_EVENTS.SESSION_ENDED, (data) => {
      setSessions((current) => ({
        ...current,
        [data.session_id]: {
          ...ensureSession(current, data.session_id),
          ended: true,
        },
      }));
    });

    return () => {
      offStarted();
      offMode();
      offJoined();
      offLeft();
      offNewMessage();
      offAnalysis();
      offAlert1();
      offAlert2();
      offAlert3();
      offSilent();
      offSOS();
      offSoap();
      offRecovery();
      offTimeline();
      offDraft();
      offEnded();
      stopEmergencyAlarm();
      socket.disconnect();
    };
  }, []);

  const sessionList = Object.values(sessions);
  const activeSession = activeSessionId ? sessions[activeSessionId] : null;
  const activeScene = buildSceneModel(activeSession?.analysis, activeSession?.mode || "ai");
  const interventionPresets =
    activeSession?.mode === "copilot"
      ? [
          "Validate their feeling, then ask one grounding question.",
          "Check immediate safety without sounding clinical.",
          "Draft a short calming response and invite one more detail.",
        ]
      : [
          "I am here with you now. Stay with me for a moment.",
          "Are you safe right now? Tell me yes or no first.",
          "Let us slow this down together. Take one breath and reply.",
        ];

  function patchSession(sessionId, patch) {
    setSessions((current) => ({
      ...current,
      [sessionId]: {
        ...ensureSession(current, sessionId),
        ...patch,
      },
    }));
  }

  function handleSetMode(sessionId, mode) {
    if (mode === "ai") {
      socket.send({ type: "counselor_left", session_id: sessionId });
    } else {
      socket.send({ type: "counselor_joined", session_id: sessionId, mode });
    }
    patchSession(sessionId, { mode });
    setActiveSessionId(sessionId);
  }

  async function handleEndSession(sessionId) {
    await generateSOAP(sessionId);
    await generateRecovery(sessionId);
  }

  function usePreset(text) {
    setCounselorInput(text);
  }

  function applyDraft(text) {
    setCounselorInput(text);
  }

  function handleSendCounselorMessage() {
    const text = counselorInput.trim();
    if (!activeSession || !text) return;
    socket.send({
      type: "counselor_message",
      session_id: activeSession.session_id,
      content: text,
    });
    setSessions((current) => {
      const session = ensureSession(current, activeSession.session_id);
      return {
        ...current,
        [activeSession.session_id]: {
          ...session,
          messages: [
            ...session.messages,
            {
              role: "counselor",
              content: text,
              analysis: null,
              timestamp: new Date().toISOString(),
            },
          ],
        },
      };
    });
    setCounselorInput("");
  }

  function focusTimelineEvent(event) {
    setFocusedTimelineEvent(event);
    const nextIndex = eventToMessageIndex(activeSession, event);
    setFocusedMessageIndex(nextIndex);
  }

  useEffect(() => {
    if (!activeSession) {
      setFocusedMessageIndex(-1);
      setFocusedTimelineEvent(null);
      return;
    }
    if (!focusedTimelineEvent) return;
    const nextIndex = eventToMessageIndex(activeSession, focusedTimelineEvent);
    setFocusedMessageIndex(nextIndex);
  }, [activeSession, focusedTimelineEvent]);

  useEffect(() => {
    if (!activeSession || focusedMessageIndex < 0) return;
    const key = `${activeSession.session_id}-${focusedMessageIndex}`;
    messageRefs.current[key]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }, [activeSession, focusedMessageIndex]);

  return (
    <div style={styles.page}>
      <div style={styles.leftColumn}>
        <div style={styles.columnHeader}>
          <div>LIVE SESSIONS</div>
          <div style={styles.headerCount}>{sessionList.length}</div>
        </div>

        <div style={styles.sessionList}>
          {sessionList.map((session) => {
            const scene = buildSceneModel(session.analysis, session.mode || "ai");
            return (
              <button
                key={session.session_id}
                onClick={() => setActiveSessionId(session.session_id)}
                style={{
                  ...styles.sessionCard,
                  borderLeft: `4px solid ${scene.accent}`,
                  boxShadow:
                    activeSessionId === session.session_id
                      ? `0 22px 46px ${scene.accent}18`
                      : "0 14px 36px rgba(0, 0, 0, 0.16)",
                  opacity: session.ended ? 0.65 : 1,
                }}
              >
                <div style={styles.sessionTop}>
                  <div>
                    <div style={styles.sessionId}>{session.session_id}</div>
                    <div style={styles.sessionMood}>{session.patient_mood || "unknown"}</div>
                  </div>
                  <div
                    style={{
                      ...styles.sessionThumbnail,
                      background: scene.roomGradient,
                      borderColor: scene.accent + "33",
                    }}
                  >
                    <div
                      style={{
                        ...styles.sessionThumbnailGlow,
                        background: scene.haze,
                        opacity: 0.3 + scene.motion * 0.2,
                      }}
                    />
                  </div>
                </div>
                <div style={{ ...styles.sessionRisk, color: scene.accent }}>
                  {session.analysis?.risk_score ?? "--"} {scene.velocityArrow}
                </div>
                <div style={styles.sessionMetaRow}>
                  <span style={{ color: scene.accent }}>{scene.weatherLabel}</span>
                  <span>{scene.modeTitle}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={styles.centerColumn}>
        <div
          style={{
            ...styles.ekgSection,
            background: "linear-gradient(180deg, rgba(13, 19, 35, 0.96), rgba(15, 24, 46, 0.92))",
            borderBottomColor: activeScene.accent + "22",
          }}
        >
          <div style={styles.sectionLabel}>LIVE EMOTIONAL EKG</div>
          <div style={styles.chartShell}>
          {activeSession?.scoreHistory?.length ? (
            <ResponsiveContainer width="100%" height={210}>
              <ComposedChart data={activeSession.scoreHistory}>
                <defs>
                  <linearGradient id="nafsiaScoreFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#ff4fb3" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#ff4fb3" stopOpacity={0.04} />
                  </linearGradient>
                  <linearGradient id="nafsiaVelocityFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#67e8f9" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#67e8f9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="rgba(143,163,196,0.12)" vertical={false} />
                <XAxis dataKey="msg" stroke="#7184a3" tickLine={false} axisLine={false} />
                <YAxis domain={[0, 10]} stroke="#7184a3" tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} cursor={{ stroke: "rgba(255,255,255,0.16)" }} />
                <ReferenceLine y={7.5} stroke="#FF4444" strokeDasharray="6 4" label="Crisis" />
                <ReferenceLine y={4.0} stroke="#FFDD00" strokeDasharray="6 4" label="Watch" />
                {focusedTimelineEvent?.score != null ? (
                  <ReferenceLine
                    y={focusedTimelineEvent.score}
                    stroke={activeScene.accent}
                    strokeDasharray="3 3"
                    label="Focus"
                  />
                ) : null}
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#ff4fb3"
                  strokeWidth={3}
                  fill="url(#nafsiaScoreFill)"
                  dot={{ r: 4, strokeWidth: 2, fill: "#ff4fb3", stroke: "#ffd2eb" }}
                  activeDot={{ r: 6, strokeWidth: 2, fill: "#fff", stroke: "#ff4fb3" }}
                />
                <Area
                  type="monotone"
                  dataKey="velocity"
                  stroke="transparent"
                  fill="url(#nafsiaVelocityFill)"
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="velocity"
                  stroke="#67e8f9"
                  strokeWidth={2}
                  strokeDasharray="6 6"
                  dot={{ r: 3, fill: "#67e8f9", strokeWidth: 0 }}
                  activeDot={{ r: 5, fill: "#67e8f9", stroke: "#fff", strokeWidth: 1 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <div style={styles.emptyEKG}>EKG will appear when patient sends first message</div>
          )}
          </div>
        </div>

        <div
          style={{
            ...styles.controlsRow,
            borderBottomColor: activeScene.accent + "22",
            boxShadow: `inset 0 1px 0 ${activeScene.accent}18`,
          }}
        >
          <div style={styles.controlsMeta}>
            <span>Session: {activeSession?.session_id || "--"}</span>
            <span style={{ color: activeScene.accent }}>{activeScene.modeTitle}</span>
          </div>
          <div style={styles.controlButtons}>
            <button
              style={styles.actionButton}
              disabled={!activeSession}
              onClick={() => activeSession && handleSetMode(activeSession.session_id, "ai")}
            >
              Observe
            </button>
            <button
              style={{ ...styles.actionButton, color: "#f4d27a", borderColor: "#f4d27a33" }}
              disabled={!activeSession}
              onClick={() => activeSession && handleSetMode(activeSession.session_id, "copilot")}
            >
              Co-pilot
            </button>
            <button
              style={{ ...styles.actionButton, color: "#7dd3fc", borderColor: "#7dd3fc33" }}
              disabled={!activeSession}
              onClick={() => activeSession && handleSetMode(activeSession.session_id, "human")}
            >
              Take over
            </button>
            <button
              style={{ ...styles.actionButton, background: "#8b5cf6", color: "#FFFFFF", borderColor: "#8b5cf655" }}
              disabled={!activeSession}
              onClick={() => activeSession && handleEndSession(activeSession.session_id)}
            >
              End+SOAP
            </button>
          </div>
        </div>

        {activeSession && activeSession.mode !== "ai" ? (
          <div
            style={{
              ...styles.interventionPanel,
              borderBottomColor: activeScene.accent + "22",
              boxShadow: `inset 0 1px 0 ${activeScene.accent}14`,
            }}
          >
            <div style={styles.interventionTop}>
              <div>
                <div style={styles.sectionLabel}>
                  {activeSession?.mode === "copilot" ? "COPILOT CONSOLE" : "COUNSELOR COMPOSER"}
                </div>
                <div style={styles.interventionHint}>
                  {activeSession?.mode === "copilot"
                    ? "Use drafts and quick commands, then send only what you want the patient to see."
                    : "Direct counselor messaging is active. Send calm, concise replies to the patient."}
                </div>
              </div>
              <div style={{ ...styles.modePill, color: activeScene.accent }}>
                {activeScene.modeTitle}
              </div>
            </div>

            <div style={styles.presetRow}>
              {interventionPresets.map((preset) => (
                <button
                  key={preset}
                  onClick={() => usePreset(preset)}
                  style={{
                    ...styles.presetChip,
                    borderColor: activeScene.accent + "30",
                    color: activeScene.accent,
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>

            {activeSession?.mode === "copilot" && activeSession.copilotDrafts?.length ? (
              <div style={styles.draftInlineList}>
                {activeSession.copilotDrafts.map((draft, index) => (
                  <div key={index} style={styles.draftInlineCard}>
                    <div style={styles.draftLabel}>Suggested draft</div>
                    <div style={styles.draftText}>{draft.response}</div>
                    <button
                      onClick={() => applyDraft(draft.response)}
                      style={styles.useDraftButton}
                    >
                      Use Draft
                    </button>
                  </div>
                ))}
              </div>
            ) : null}

            <div style={styles.composerRow}>
              <textarea
                value={counselorInput}
                onChange={(event) => setCounselorInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    handleSendCounselorMessage();
                  }
                }}
                placeholder={
                  activeSession?.mode === "copilot"
                    ? "Refine the draft or write a counselor response..."
                    : "Type a direct message to the patient..."
                }
                style={styles.composerInput}
              />
              <button onClick={handleSendCounselorMessage} style={styles.sendCounselorButton}>
                Send to Patient
              </button>
            </div>
          </div>
        ) : null}

        <div style={styles.timelineSection}>
          <div style={styles.sectionLabel}>RUPTURE TIMELINE</div>
          <div style={styles.timelineRow}>
            {(activeSession?.timelineEvents || []).map((event) => (
              <button
                key={event.id}
                onClick={() => focusTimelineEvent(event)}
                style={{
                  ...styles.timelineNode,
                  borderColor:
                    focusedTimelineEvent?.id === event.id ? activeScene.accent : "rgba(255,255,255,0.08)",
                  background:
                    focusedTimelineEvent?.id === event.id ? activeScene.accent + "15" : "rgba(255,255,255,0.03)",
                }}
              >
                <span style={styles.timelineDot} />
                <span style={styles.timelineSummary}>{event.summary}</span>
              </button>
            ))}
          </div>
        </div>

        {focusedTimelineEvent ? (
          <div style={styles.focusBanner}>
            Focused event: {focusedTimelineEvent.summary}
          </div>
        ) : null}

        <div style={styles.conversationFeed}>
          {(activeSession?.messages || []).map((message, index) => {
            const tier = messageTier(message);
            const color = TIER_COLORS[tier] || TIER_COLORS.safe;
            const distortions = distortionsFromMessage(message);
            const focusKey = `${activeSession?.session_id}-${index}`;
            return (
              <div
                key={`${message.role}-${index}`}
                ref={(node) => {
                  if (!activeSession?.session_id) return;
                  if (node) {
                    messageRefs.current[focusKey] = node;
                  } else {
                    delete messageRefs.current[focusKey];
                  }
                }}
                style={{
                  ...styles.feedMessage,
                  borderLeft: `3px solid ${color}`,
                  background: `${color}16`,
                  boxShadow:
                    focusedMessageIndex === index
                      ? `0 0 0 1px ${activeScene.accent}55, 0 24px 48px ${activeScene.accent}12`
                      : styles.feedMessage.boxShadow,
                }}
              >
                <div style={styles.feedTopRow}>
                  <span style={{ ...styles.feedRole, color }}>{message.role}</span>
                  {message.analysis?.risk_score != null ? (
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

        {activeSession?.recovery ? (
          <div style={styles.recoverySection}>
            <RecoveryCanvas recovery={activeSession.recovery} dark compact />
          </div>
        ) : null}
      </div>

      <div style={styles.rightColumn}>
        <div style={styles.columnHeader}>ALERT LOG</div>
        <div style={styles.alertList}>
          {alerts.map((alert) => {
            const color = ALERT_SEVERITY_COLORS[alert.severity] || "#94A3B8";
            return (
              <div key={alert.id} style={{ ...styles.alertCard, borderLeft: `4px solid ${color}` }}>
                <div style={styles.alertHeader}>
                  <span style={{ ...styles.alertBadge, background: color }}>{alert.severity}</span>
                  <span style={styles.alertTime}>{alert.timestamp}</span>
                </div>
                <div style={styles.alertReason}>{alert.reason}</div>
                {alert.preview ? <div style={styles.alertPreview}>{alert.preview}</div> : null}
                <div style={styles.alertSession}>{alert.session_id}</div>
              </div>
            );
          })}
        </div>

        {activeSession?.analysis ? (
          <div style={styles.miniPanel}>
            <div style={styles.sectionLabel}>LIVE ANALYSIS</div>
            <div style={{ ...styles.miniRisk, color: activeScene.accent }}>
              {activeSession.analysis.risk_score}
            </div>
            <div style={styles.miniItem}>Emotion: {activeSession.analysis.emotion}</div>
            <div style={styles.miniItem}>Velocity: {activeSession.analysis.velocity_arrow}</div>
            <div style={styles.miniItem}>Technique: {activeSession.analysis.technique}</div>
            <div style={styles.miniItem}>Mode: {activeScene.modeTitle}</div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

const styles = {
  page: {
    display: "flex",
    minHeight: "100vh",
    background:
      "radial-gradient(circle at top left, rgba(125, 211, 252, 0.08), transparent 22%), linear-gradient(180deg, #060a14 0%, #090f1d 100%)",
    color: "#FFFFFF",
    fontFamily: "monospace",
  },
  leftColumn: {
    width: 260,
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
    width: 300,
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
    borderRadius: 20,
  },
  sessionTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  sessionId: {
    fontWeight: "bold",
    marginBottom: 6,
  },
  sessionMood: {
    color: "#94A3B8",
    fontSize: 12,
  },
  sessionThumbnail: {
    width: 56,
    height: 56,
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    position: "relative",
    overflow: "hidden",
    flexShrink: 0,
  },
  sessionThumbnailGlow: {
    position: "absolute",
    inset: 8,
    borderRadius: "50%",
    filter: "blur(12px)",
  },
  sessionRisk: {
    fontWeight: "bold",
    marginBottom: 6,
  },
  sessionMetaRow: {
    display: "flex",
    justifyContent: "space-between",
    color: "#8ea0bf",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
  },
  ekgSection: {
    padding: 16,
    borderBottom: "1px solid rgba(143, 163, 196, 0.12)",
  },
  chartShell: {
    borderRadius: 22,
    padding: "14px 12px 8px",
    background:
      "radial-gradient(circle at top left, rgba(255,79,179,0.08), transparent 24%), linear-gradient(180deg, rgba(5, 10, 21, 0.88), rgba(7, 13, 27, 0.92))",
    border: "1px solid rgba(255,255,255,0.06)",
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.03)",
  },
  sectionLabel: {
    fontWeight: "bold",
    letterSpacing: "0.08em",
    fontSize: 12,
    marginBottom: 12,
    color: "#b7c6df",
  },
  emptyEKG: {
    color: "#64748B",
    height: 160,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  controlsRow: {
    padding: "12px 16px",
    borderBottom: "1px solid rgba(143, 163, 196, 0.12)",
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
    background: "rgba(8, 13, 27, 0.8)",
  },
  controlsMeta: {
    display: "flex",
    gap: 16,
    color: "#c9d6ea",
    alignItems: "center",
  },
  controlButtons: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  actionButton: {
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#fff",
    borderRadius: 999,
    padding: "10px 14px",
    cursor: "pointer",
  },
  timelineSection: {
    padding: "14px 16px 10px",
    borderBottom: "1px solid rgba(143, 163, 196, 0.08)",
  },
  interventionPanel: {
    padding: "14px 16px 16px",
    borderBottom: "1px solid rgba(143, 163, 196, 0.08)",
    background: "linear-gradient(180deg, rgba(10,16,31,0.94), rgba(10,16,31,0.86))",
  },
  interventionTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
    marginBottom: 12,
  },
  interventionHint: {
    color: "#8ea0bf",
    lineHeight: 1.6,
    maxWidth: 720,
  },
  modePill: {
    borderRadius: 999,
    padding: "8px 12px",
    border: "1px solid rgba(255,255,255,0.08)",
    background: "rgba(255,255,255,0.03)",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontSize: 11,
    fontWeight: "bold",
    flexShrink: 0,
  },
  presetRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 14,
  },
  presetChip: {
    background: "rgba(255,255,255,0.03)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 999,
    padding: "10px 14px",
    cursor: "pointer",
    textAlign: "left",
  },
  draftInlineList: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 10,
    marginBottom: 14,
  },
  draftInlineCard: {
    borderRadius: 18,
    padding: 14,
    background: "rgba(244,210,122,0.08)",
    border: "1px solid rgba(244,210,122,0.14)",
  },
  useDraftButton: {
    marginTop: 12,
    background: "#f4d27a",
    color: "#07101d",
    border: "none",
    borderRadius: 999,
    padding: "8px 12px",
    cursor: "pointer",
    fontWeight: "bold",
  },
  composerRow: {
    display: "flex",
    gap: 12,
    alignItems: "stretch",
  },
  composerInput: {
    flex: 1,
    minHeight: 84,
    background: "rgba(5,10,21,0.88)",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 18,
    padding: "14px 16px",
    resize: "vertical",
    outline: "none",
    font: "inherit",
    lineHeight: 1.6,
  },
  sendCounselorButton: {
    minWidth: 150,
    borderRadius: 18,
    border: "none",
    background: "linear-gradient(135deg, #7dd3fc 0%, #a78bfa 100%)",
    color: "#07101d",
    fontWeight: "bold",
    cursor: "pointer",
    padding: "0 18px",
  },
  timelineRow: {
    display: "flex",
    gap: 10,
    overflowX: "auto",
    paddingBottom: 4,
  },
  timelineNode: {
    minWidth: 180,
    padding: "12px 14px",
    borderRadius: 16,
    border: "1px solid rgba(255,255,255,0.08)",
    color: "#fff",
    background: "rgba(255,255,255,0.03)",
    textAlign: "left",
    cursor: "pointer",
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    background: "#7dd3fc",
    display: "inline-block",
    marginBottom: 10,
  },
  timelineSummary: {
    display: "block",
    lineHeight: 1.5,
    color: "#dbe6f5",
  },
  focusBanner: {
    padding: "12px 16px",
    background: "rgba(125,211,252,0.1)",
    color: "#cfe8ff",
    borderBottom: "1px solid rgba(125,211,252,0.12)",
  },
  conversationFeed: {
    flex: 1,
    overflowY: "auto",
    padding: 16,
    display: "flex",
    flexDirection: "column",
    gap: 12,
  },
  feedMessage: {
    borderRadius: 18,
    padding: 14,
  },
  feedTopRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 8,
  },
  feedRole: {
    fontWeight: "bold",
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    fontSize: 11,
  },
  feedRisk: {
    color: "#cbd5e1",
    fontWeight: "bold",
  },
  feedContent: {
    color: "#f5f7fb",
    lineHeight: 1.65,
  },
  distortionRow: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
    marginTop: 10,
  },
  distortionTag: {
    background: "rgba(255,68,68,0.12)",
    color: "#ff9da4",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 11,
  },
  soapSection: {
    borderTop: "1px solid rgba(168, 85, 247, 0.35)",
    padding: 16,
    background: "rgba(13, 10, 27, 0.8)",
  },
  soapLabel: {
    color: "#c8b5ff",
    fontWeight: "bold",
    marginBottom: 12,
    letterSpacing: "0.08em",
  },
  soapBlock: {
    marginBottom: 12,
  },
  soapHeading: {
    fontSize: 12,
    color: "#9fb2d1",
    marginBottom: 4,
  },
  soapText: {
    color: "#fff",
    lineHeight: 1.65,
  },
  recoverySection: {
    padding: 16,
  },
  alertList: {
    overflowY: "auto",
    padding: 10,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  alertCard: {
    background: "rgba(15, 21, 38, 0.82)",
    borderRadius: 18,
    padding: 14,
  },
  alertHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  alertBadge: {
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 10,
    color: "#07101d",
    fontWeight: "bold",
    textTransform: "uppercase",
  },
  alertTime: {
    color: "#8ea0bf",
    fontSize: 11,
  },
  alertReason: {
    color: "#fff",
    lineHeight: 1.5,
    marginBottom: 8,
  },
  alertPreview: {
    color: "#a9bad4",
    fontStyle: "italic",
    marginBottom: 8,
  },
  alertSession: {
    color: "#7dd3fc",
    fontSize: 12,
  },
  draftCard: {
    borderRadius: 18,
    padding: 14,
    background: "rgba(244,210,122,0.08)",
    border: "1px solid rgba(244,210,122,0.14)",
    marginBottom: 10,
  },
  draftLabel: {
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.08em",
    color: "#f4d27a",
    marginBottom: 8,
  },
  draftText: {
    color: "#fff",
    lineHeight: 1.6,
  },
  miniPanel: {
    borderTop: "1px solid rgba(143,163,196,0.12)",
    padding: 16,
  },
  miniRisk: {
    fontSize: 34,
    fontWeight: "bold",
    marginBottom: 10,
  },
  miniItem: {
    color: "#e7eef9",
    marginBottom: 6,
  },
};
