from fastapi import APIRouter
from pydantic import BaseModel
from typing import List
import asyncio
from concurrent.futures import ThreadPoolExecutor

from models.emotion_classifier import classify_emotion, classify_emotion_heuristic
from models.stress_detector import detect_stress, detect_stress_heuristic
from models.suicide_detector import detect_suicide_risk, detect_suicide_risk_heuristic
from models.psycho_analyzer import PsychoAnalyzer
from models.velocity_tracker import VelocityTracker
from models.technique_router import TechniqueRouter
from utils.risk_formula import compute_full_risk, get_risk_tier
from websocket.manager import manager
from websocket.events import ANALYSIS_UPDATE, ALERT_TIER1, ALERT_TIER2, ALERT_TIER3, SILENT_SIGNAL, TIMELINE_EVENT
from store.session_store import store

router = APIRouter()
executor = ThreadPoolExecutor(max_workers=4)
psycho = PsychoAnalyzer()
vt = VelocityTracker()
tr = TechniqueRouter()
MODEL_TIMEOUT_SECONDS = 3.5


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


def _apply_crisis_overrides(emotion_result: dict, stress_result: dict, suicide_result: dict):
    if suicide_result["label"] != "suicidal":
        return emotion_result, stress_result

    emotion_override = dict(emotion_result)
    if emotion_override["top_emotion"] in {"neutral", "joy"}:
        emotion_override["top_emotion"] = "sadness"
        emotion_override["top_score"] = max(emotion_override["top_score"], suicide_result["score"])
        emotion_override["risk_contribution"] = max(
            emotion_override["risk_contribution"],
            round(min(1.0, suicide_result["score"] * 0.95), 4),
        )

    stress_override = dict(stress_result)
    stress_override["label"] = "stressed"
    stress_override["intensity"] = max(stress_override["intensity"], suicide_result["score"])
    stress_override["risk_contribution"] = max(
        stress_override["risk_contribution"],
        round(min(1.0, suicide_result["score"]), 4),
    )

    return emotion_override, stress_override


async def _run_model(loop, fn, fallback_fn, text: str):
    try:
        return await asyncio.wait_for(
            loop.run_in_executor(executor, fn, text),
            timeout=MODEL_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        print(f"[NAFSIA] Timed fallback for {fn.__name__}: {exc}")
        return fallback_fn(text)


@router.post("/analyze")
async def analyze(req: AnalyzeRequest):
    session = store.get_session(req.session_id)
    if not session:
        store.create_session(req.session_id, "unknown", 5.0)
        session = store.get_session(req.session_id)

    score_history = session["score_history"]
    message_metadata = session["message_metadata"]

    loop = asyncio.get_event_loop()
    emotion_result, stress_result, psycho_result, suicide_result = await asyncio.gather(
        _run_model(loop, classify_emotion, classify_emotion_heuristic, req.message),
        _run_model(loop, detect_stress, detect_stress_heuristic, req.message),
        loop.run_in_executor(executor, psycho.analyze, req.message),
        _run_model(loop, detect_suicide_risk, detect_suicide_risk_heuristic, req.message),
    )
    emotion_result, stress_result = _apply_crisis_overrides(
        emotion_result, stress_result, suicide_result
    )

    risk_data = compute_full_risk(emotion_result, stress_result, psycho_result)
    suicide_boost = 8.8 if suicide_result["label"] == "suicidal" and suicide_result["score"] >= 0.65 else 0.0
    risk_score = max(risk_data["risk_score"], _crisis_phrase_boost(req.message), suicide_boost)
    risk_data["risk_score"] = risk_score
    risk_data["risk_tier"] = get_risk_tier(risk_score)
    prior_history = score_history if score_history else [session.get("baseline_score", 5.0)]
    updated_history = prior_history + [risk_score]
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
        "suicide_label": suicide_result["label"],
        "suicide_score": suicide_result["score"],
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
        "session_mode": store.get_session_mode(req.session_id),
    }

    store.append_message(req.session_id, "patient", req.message, response)
    timeline_events = []
    if len(score_history) == 0:
        event = store.add_timeline_event(
            req.session_id,
            "first_spike",
            f"First measured risk landed at {risk_score}/10",
            score=risk_score,
            mode=response["session_mode"],
        )
        if event:
            timeline_events.append(event)
    if risk_score >= 7.5:
        event = store.add_timeline_event(
            req.session_id,
            "tier_3_alert",
            "Tier 3 crisis alert triggered",
            score=risk_score,
            mode=response["session_mode"],
        )
        if event:
            timeline_events.append(event)
    elif risk_score >= 6.0:
        event = store.add_timeline_event(
            req.session_id,
            "tier_2_alert",
            "Tier 2 concern alert triggered",
            score=risk_score,
            mode=response["session_mode"],
        )
        if event:
            timeline_events.append(event)
    elif risk_score >= 4.0:
        event = store.add_timeline_event(
            req.session_id,
            "tier_1_alert",
            "Tier 1 watch alert triggered",
            score=risk_score,
            mode=response["session_mode"],
        )
        if event:
            timeline_events.append(event)

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
        event = store.add_timeline_event(
            req.session_id,
            "silent_signal",
            silent["reason"],
            score=risk_score,
            mode=response["session_mode"],
        )
        await manager.send_to_counselors(req.session_id, {
            "type": SILENT_SIGNAL,
            "session_id": req.session_id,
            "reason": silent["reason"]
        })
        if event:
            timeline_events.append(event)

    for event in timeline_events:
        await manager.send_to_counselors(
            req.session_id,
            {
                "type": TIMELINE_EVENT,
                "session_id": req.session_id,
                "event": event,
            },
        )
        await manager.send_to_patient(
            req.session_id,
            {
                "type": TIMELINE_EVENT,
                "session_id": req.session_id,
                "event": event,
            },
        )

    return response
