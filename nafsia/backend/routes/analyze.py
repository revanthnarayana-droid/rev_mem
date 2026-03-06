from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
import asyncio
from concurrent.futures import ThreadPoolExecutor

from models.emotion_classifier import classify_emotion
from models.stress_detector import detect_stress
from models.psycho_analyzer import PsychoAnalyzer
from models.velocity_tracker import VelocityTracker
from models.technique_router import TechniqueRouter
from utils.risk_formula import compute_full_risk, get_risk_tier
from websocket.manager import manager
from websocket.events import ANALYSIS_UPDATE, ALERT_TIER1, ALERT_TIER2, ALERT_TIER3, SILENT_SIGNAL
from store.session_store import store

router = APIRouter()
executor = ThreadPoolExecutor(max_workers=4)
psycho = PsychoAnalyzer()
vt = VelocityTracker()
tr = TechniqueRouter()


class AnalyzeRequest(BaseModel):
    message: str
    session_id: str


def _detect_silent_signal(metadata: list) -> dict:
    if len(metadata) < 4:
        return {"silent_signal": False, "reason": ""}
    lengths = [m["text_length"] for m in metadata]
    if all(l < 10 for l in lengths[-3:]) and (sum(lengths[:-3]) / max(len(lengths[:-3]), 1)) > 50:
        return {"silent_signal": True, "reason": "Message length collapsed"}
    last5 = lengths[-5:]
    if len(last5) == 5 and all(last5[i] > last5[i + 1] for i in range(4)):
        return {"silent_signal": True, "reason": "Progressive disengagement detected"}
    return {"silent_signal": False, "reason": ""}


def _crisis_phrase_boost(text: str) -> float:
    text_lower = text.lower()
    crisis_phrases = [
        "do not see a reason to keep going",
        "don't see a reason to keep going",
        "no reason to keep going",
        "cannot go on",
        "can't go on",
        "want to die",
        "end my life",
        "kill myself",
        "better off dead",
        "no point in living",
    ]
    return 7.8 if any(phrase in text_lower for phrase in crisis_phrases) else 0.0


@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    session = store.get_session(req.session_id)
    if not session:
        store.create_session(req.session_id, "unknown", 5.0)
        session = store.get_session(req.session_id)

    score_history = session["score_history"]
    message_metadata = session["message_metadata"]

    loop = asyncio.get_event_loop()
    emotion_result, stress_result, psycho_result = await asyncio.gather(
        loop.run_in_executor(executor, classify_emotion, req.message),
        loop.run_in_executor(executor, detect_stress, req.message),
        loop.run_in_executor(executor, psycho.analyze, req.message),
    )

    risk_data = compute_full_risk(emotion_result, stress_result, psycho_result)
    risk_score = max(risk_data["risk_score"], _crisis_phrase_boost(req.message))
    risk_data["risk_score"] = risk_score
    risk_data["risk_tier"] = get_risk_tier(risk_score)
    updated_history = score_history + [risk_score]
    vel_data = vt.full_analysis(updated_history)
    tech_data = tr.select_technique(
        emotion_result["top_emotion"], emotion_result["top_score"],
        stress_result["label"], psycho_result, risk_score
    )
    silent = _detect_silent_signal(message_metadata)

    response = {
        "emotion": emotion_result["top_emotion"],
        "emotion_score": emotion_result["top_score"],
        "stress_label": stress_result["label"],
        "stress_intensity": stress_result["intensity"],
        "psycho_profile": psycho_result,
        "risk_score": risk_score,
        "risk_tier": risk_data["risk_tier"],
        "velocity": vel_data["velocity"],
        "acceleration": vel_data["acceleration"],
        "velocity_trend": vel_data["trend"],
        "velocity_arrow": vel_data["arrow"],
        "alert": vel_data["alert"] or risk_score >= 4.0,
        "alert_reason": vel_data["alert_reason"],
        "alert_severity": vel_data["alert_severity"],
        "technique": tech_data["technique"],
        "technique_color": tech_data["color"],
        "silent_signal": silent["silent_signal"],
        "silent_signal_reason": silent["reason"],
        "updated_score_history": updated_history,
    }

    await manager.send_to_counselors(req.session_id, {
        "type": ANALYSIS_UPDATE,
        "session_id": req.session_id,
        "analysis": response,
        "message_preview": req.message[:80]
    })

    if risk_score >= 7.5:
        alert_event = ALERT_TIER3
    elif risk_score >= 6.0:
        alert_event = ALERT_TIER2
    elif risk_score >= 4.0:
        alert_event = ALERT_TIER1
    else:
        alert_event = None

    if alert_event:
        await manager.send_to_counselors(req.session_id, {
            "type": alert_event,
            "session_id": req.session_id,
            "analysis": response,
            "message_preview": req.message[:80]
        })

    if silent["silent_signal"]:
        await manager.send_to_counselors(req.session_id, {
            "type": SILENT_SIGNAL,
            "session_id": req.session_id,
            "reason": silent["reason"]
        })

    return response
