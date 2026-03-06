from typing import Dict, List, Optional
from datetime import datetime
import uuid


class SessionStore:
    def __init__(self):
        self.sessions: Dict[str, dict] = {}

    def create_session(self, session_id, patient_mood, baseline_score) -> dict:
        session = {
            "session_id": session_id,
            "started_at": datetime.utcnow().isoformat(),
            "patient_mood": patient_mood,
            "baseline_score": baseline_score,
            "messages": [],
            "score_history": [],
            "message_metadata": [],
            "peak_risk_score": 0.0,
            "average_risk_score": 0.0,
            "primary_emotion": "neutral",
            "dominant_technique": "ROGERIAN",
            "technique_counts": {"CBT": 0, "DBT": 0, "MI": 0, "ROGERIAN": 0},
            "velocity_history": [],
            "crisis_occurred": False,
            "sos_fired": False,
            "session_mode": "ai",
            "soap_note": None,
            "recovery_card": None,
            "cognitive_distortions_seen": set(),
        }
        self.sessions[session_id] = session
        return session

    def get_session(self, session_id) -> Optional[dict]:
        return self.sessions.get(session_id)

    def append_message(self, session_id, role, content, analysis=None):
        session = self.get_session(session_id)
        if not session:
            return
        msg = {
            "id": str(uuid.uuid4())[:8],
            "role": role,
            "content": content,
            "timestamp": datetime.utcnow().isoformat(),
            "analysis": analysis or {},
        }
        session["messages"].append(msg)
        if analysis:
            risk = analysis.get("risk_score", 0.0)
            session["score_history"].append(risk)
            session["message_metadata"].append(
                {
                    "text_length": len(content),
                    "timestamp": int(datetime.utcnow().timestamp() * 1000),
                }
            )
            if risk > session["peak_risk_score"]:
                session["peak_risk_score"] = risk
            scores = session["score_history"]
            session["average_risk_score"] = round(sum(scores) / len(scores), 2)
            if analysis.get("emotion"):
                session["primary_emotion"] = analysis["emotion"]
            t = analysis.get("technique", "ROGERIAN")
            if t in session["technique_counts"]:
                session["technique_counts"][t] += 1
            session["dominant_technique"] = max(
                session["technique_counts"], key=session["technique_counts"].get
            )
            for d in analysis.get("psycho_profile", {}).get(
                "cognitive_distortions", []
            ):
                session["cognitive_distortions_seen"].add(d)
            if risk >= 7.5:
                session["crisis_occurred"] = True
            session["velocity_history"].append(analysis.get("velocity", 0.0))
        return msg

    def set_session_mode(self, session_id, mode):
        s = self.get_session(session_id)
        if s:
            s["session_mode"] = mode

    def get_session_mode(self, session_id) -> str:
        s = self.get_session(session_id)
        return s["session_mode"] if s else "ai"

    def flag_sos(self, session_id):
        s = self.get_session(session_id)
        if s:
            s["sos_fired"] = True
            s["crisis_occurred"] = True

    def save_soap(self, session_id, soap):
        s = self.get_session(session_id)
        if s:
            s["soap_note"] = soap

    def save_recovery(self, session_id, recovery):
        s = self.get_session(session_id)
        if s:
            s["recovery_card"] = recovery

    def get_chat_history(self, session_id, last_n=10) -> List[dict]:
        s = self.get_session(session_id)
        if not s:
            return []
        role_map = {
            "patient": "user",
            "user": "user",
            "assistant": "assistant",
            "counselor": "assistant",
        }
        return [
            {"role": role_map.get(m["role"], "user"), "content": m["content"]}
            for m in s["messages"][-last_n:]
        ]

    def get_all_sessions_summary(self) -> List[dict]:
        return [
            {
                "session_id": sid,
                "current_risk": s["score_history"][-1] if s["score_history"] else 0.0,
                "peak_risk": s["peak_risk_score"],
                "primary_emotion": s["primary_emotion"],
                "crisis_occurred": s["crisis_occurred"],
                "session_mode": s["session_mode"],
                "message_count": len(s["messages"]),
            }
            for sid, s in self.sessions.items()
        ]


store = SessionStore()
