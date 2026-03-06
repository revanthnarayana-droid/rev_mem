from fastapi import APIRouter
from pydantic import BaseModel
import os, json
from openai import OpenAI
from dotenv import load_dotenv
from datetime import datetime
from store.session_store import store
from websocket.manager import manager
from websocket.events import SOAP_READY

load_dotenv()
router = APIRouter()
client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1",
)


class SOAPRequest(BaseModel):
    session_id: str


def _normalize_section(text: str, fallback: str) -> str:
    content = (text or "").strip()
    if not content:
        content = fallback
    sentences = [s.strip() for s in content.replace("\n", " ").split(".") if s.strip()]
    if len(sentences) > 4:
        sentences = sentences[:4]
    if len(sentences) < 3:
        fallback_sentences = [s.strip() for s in fallback.split(".") if s.strip()]
        for sentence in fallback_sentences:
            if len(sentences) >= 3:
                break
            sentences.append(sentence)
    return ". ".join(sentences[:4]) + "."


@router.post("/soap")
async def generate_soap(req: SOAPRequest):
    session = store.get_session(req.session_id)
    if not session:
        return {"error": "Session not found"}

    user_msgs = [m["content"] for m in session["messages"] if m["role"] == "user"][-8:]
    patient_text = " | ".join(user_msgs)

    prompt = (
        f"You are a clinical mental health professional writing a SOAP note. "
        f"Patient messages: {patient_text}. "
        f"Primary emotion: {session['primary_emotion']}. "
        f"Peak risk: {session['peak_risk_score']}/10. "
        f"Average risk: {session['average_risk_score']}/10. "
        f"Technique used: {session['dominant_technique']}. "
        f"Crisis occurred: {session['crisis_occurred']}. "
        f"SOS fired: {session['sos_fired']}. "
        f"Cognitive distortions: {list(session['cognitive_distortions_seen'])}. "
        f"Return ONLY valid JSON with keys: subjective, objective, assessment, plan. "
        f"Each 3-4 sentences. Clinical but compassionate. No markdown."
    )

    try:
        comp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=700, temperature=0.4
        )
        text = comp.choices[0].message.content.strip()
        text = text.replace("```json", "").replace("```", "").strip()
        soap = json.loads(text)
    except Exception:
        soap = {
            "subjective": (
                "Patient described significant emotional strain during the session. "
                "They shared recent thoughts and feelings in a direct but distressed way. "
                "Themes of overwhelm and discouragement were present across the discussion."
            ),
            "objective": (
                f"Peak risk score reached {session['peak_risk_score']}/10 during the session. "
                f"Primary emotion was recorded as {session['primary_emotion']}. "
                f"The dominant intervention style used was {session['dominant_technique']}."
            ),
            "assessment": (
                "Presentation is consistent with meaningful psychological distress needing follow-up. "
                "Current risk indicators suggest continued monitoring is clinically appropriate. "
                "Cognitive and emotional burden appear to be affecting coping capacity."
            ),
            "plan": (
                "Recommend structured follow-up within 48 hours. "
                "Reinforce coping tools and review available crisis resources. "
                "Escalate to higher-support intervention if risk indicators increase again."
            ),
        }

    soap["subjective"] = _normalize_section(
        soap.get("subjective", ""),
        "Patient described significant emotional strain during the session. "
        "They shared recent thoughts and feelings in a direct but distressed way. "
        "Themes of overwhelm and discouragement were present across the discussion."
    )
    soap["objective"] = _normalize_section(
        soap.get("objective", ""),
        f"Peak risk score reached {session['peak_risk_score']}/10 during the session. "
        f"Primary emotion was recorded as {session['primary_emotion']}. "
        f"The dominant intervention style used was {session['dominant_technique']}."
    )
    soap["assessment"] = _normalize_section(
        soap.get("assessment", ""),
        "Presentation is consistent with meaningful psychological distress needing follow-up. "
        "Current risk indicators suggest continued monitoring is clinically appropriate. "
        "Cognitive and emotional burden appear to be affecting coping capacity."
    )
    soap["plan"] = _normalize_section(
        soap.get("plan", ""),
        "Recommend structured follow-up within 48 hours. "
        "Reinforce coping tools and review available crisis resources. "
        "Escalate to higher-support intervention if risk indicators increase again."
    )

    soap["session_id"] = req.session_id
    soap["generated_at"] = datetime.utcnow().isoformat()
    soap["risk_flag"] = session["peak_risk_score"] >= 7.0 or session["crisis_occurred"]

    store.save_soap(req.session_id, soap)
    await manager.send_to_counselors(req.session_id, {
        "type": SOAP_READY, "session_id": req.session_id, "soap": soap
    })
    return soap
