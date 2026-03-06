const API_BASE = process.env.REACT_APP_API_URL || "http://localhost:8000";

async function post(endpoint, body) {
  const res = await fetch(API_BASE + endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("API error " + res.status + " on " + endpoint);
  return res.json();
}

export async function analyzeMessage(message, sessionId) {
  return post("/analyze", { message, session_id: sessionId });
}

export async function sendChatMessage({ message, sessionId, technique, emotion, riskScore }) {
  return post("/chat", {
    message,
    session_id: sessionId,
    technique: technique || "ROGERIAN",
    emotion: emotion || "neutral",
    risk_score: riskScore || 0.0,
  });
}

export async function triggerSOS(sessionId) {
  return post("/sos", { session_id: sessionId });
}

export async function generateRecovery(sessionId) {
  return post("/recovery", { session_id: sessionId });
}

export async function generateSOAP(sessionId) {
  return post("/soap", { session_id: sessionId });
}

export async function startSession(sessionId, mood, baselineScore) {
  return post("/session/start", {
    session_id: sessionId,
    mood: mood,
    baseline_score: baselineScore
  });
}
