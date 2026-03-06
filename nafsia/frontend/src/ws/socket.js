const WS_BASE = process.env.REACT_APP_WS_URL || "ws://localhost:8000";

class NAFSIASocket {
  constructor() {
    this.ws = null;
    this.role = null;
    this.sessionId = null;
    this.listeners = {};
    this.reconnectAttempts = 0;
    this.maxReconnects = 5;
    this._reconnectUrl = null;
    this._manualClose = false;
  }

  connectPatient(sessionId) {
    this.role = "patient";
    this.sessionId = sessionId;
    this._connect(WS_BASE + "/ws/patient/" + sessionId);
  }

  connectCounselor(sessionId) {
    this.role = "counselor";
    this.sessionId = sessionId;
    this._connect(WS_BASE + "/ws/counselor/" + sessionId);
  }

  connectCounselorHub() {
    this.role = "counselor-hub";
    this._connect(WS_BASE + "/ws/counselor-hub");
  }

  _connect(url) {
    this._reconnectUrl = url;
    this._manualClose = false;
    if (this.ws) {
      this._manualClose = true;
      this.ws.close();
    }
    console.log("[NAFSIA WS] Connecting to", url);
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      console.log("[NAFSIA WS] Connected");
      this.reconnectAttempts = 0;
      this._manualClose = false;
      this._emit("connected", {});
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[NAFSIA WS] Event:", data.type, data);
        this._emit(data.type, data);
        this._emit("*", data);
      } catch (e) {
        console.error("[NAFSIA WS] Parse error", e);
      }
    };

    this.ws.onclose = () => {
      this._emit("disconnected", {});
      if (!this._manualClose && this.reconnectAttempts < this.maxReconnects) {
        this.reconnectAttempts++;
        setTimeout(() => this._connect(url), this.reconnectAttempts * 1500);
      }
    };

    this.ws.onerror = (err) => console.error("[NAFSIA WS] Error", err);
  }

  send(data) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN)
      this.ws.send(JSON.stringify(data));
    else
      console.warn("[NAFSIA WS] Cannot send — not connected");
  }

  on(eventType, callback) {
    if (!this.listeners[eventType]) this.listeners[eventType] = [];
    this.listeners[eventType].push(callback);
    return () => {
      this.listeners[eventType] = this.listeners[eventType].filter(cb => cb !== callback);
    };
  }

  _emit(eventType, data) {
    (this.listeners[eventType] || []).forEach(cb => cb(data));
  }

  disconnect() {
    if (this.ws) {
      this._manualClose = true;
      this.ws.close();
      this.ws = null;
    }
  }

  get isConnected() {
    return this.ws && this.ws.readyState === WebSocket.OPEN;
  }
}

export const socket = new NAFSIASocket();

export const WS_EVENTS = {
  ANALYSIS_UPDATE: "analysis_update",
  ALERT_TIER1: "alert_tier1",
  ALERT_TIER2: "alert_tier2",
  ALERT_TIER3: "alert_tier3",
  SILENT_SIGNAL: "silent_signal",
  SOS_FIRED: "sos_fired",
  SESSION_STARTED: "session_started",
  SESSION_ENDED: "session_ended",
  NEW_MESSAGE: "new_message",
  SOAP_READY: "soap_ready",
  RECOVERY_READY: "recovery_ready",
  COUNSELOR_JOINED: "counselor_joined",
  COUNSELOR_LEFT: "counselor_left",
  COUNSELOR_MESSAGE: "counselor_message",
  SESSION_MODE_CHANGED: "session_mode_changed",
  TIMELINE_EVENT: "timeline_event",
  COPILOT_DRAFT_READY: "copilot_draft_ready",
};
