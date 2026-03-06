from fastapi import APIRouter
from pydantic import BaseModel
import os, json
from openai import OpenAI
from dotenv import load_dotenv
from store.session_store import store
from websocket.manager import manager
from websocket.events import RECOVERY_READY, TIMELINE_EVENT

load_dotenv()
router = APIRouter()
client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1",
)


class RecoveryRequest(BaseModel):
    session_id: str


@router.post("/recovery")
async def generate_recovery(req: RecoveryRequest):
    session = store.get_session(req.session_id)
    if not session:
        return {"error": "Session not found"}

    user_msgs = [m["content"] for m in session["messages"] if m["role"] in {"user", "patient"}][-10:]
    summary = " ".join(user_msgs)[:500]
    emotion = session["primary_emotion"]
    technique = session["dominant_technique"]
    risk = session["average_risk_score"]

    prompt = (
        f"Based on this therapy session generate a personalized recovery protocol. "
        f"Session summary: {summary}. Primary emotion: {emotion}. "
        f"Therapeutic approach: {technique}. Risk level: {risk}/10. "
        f"Return ONLY valid JSON with exactly these keys: "
        f"breathing_technique_name, breathing_exercise, journaling_prompt, "
        f"resource_title, resource_description, affirmation (under 12 words), "
        f"session_summary (2 warm sentences to the patient), micro_plan, "
        f"stabilizer_summary, tone, visual_theme. "
        f"No markdown. No explanation. JSON only."
    )

    try:
        comp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            max_tokens=600, temperature=0.7
        )
        text = comp.choices[0].message.content.strip()
        text = text.replace("```json", "").replace("```", "").strip()
        recovery = json.loads(text)
    except Exception:
        recovery = {
            "breathing_technique_name": "Box Breathing",
            "breathing_exercise": "Inhale 4 counts. Hold 4. Exhale 4. Hold 4. Repeat 4 times.",
            "journaling_prompt": "What is one small thing that felt okay today?",
            "resource_title": "iCall Counselling",
            "resource_description": "Free confidential mental health support in India.",
            "affirmation": "You showed up today. That took courage.",
            "session_summary": "You explored some difficult feelings today. That takes real strength.",
            "micro_plan": "Drink water, take five steady breaths, text one trusted person, and rest away from intense triggers tonight.",
            "stabilizer_summary": "Structured breathing and slowing down your thoughts seemed to create a little space in the session.",
            "tone": "grounded",
            "visual_theme": "dawn",
        }

    store.save_recovery(req.session_id, recovery)
    timeline_event = store.add_timeline_event(
        req.session_id, "recovery_ready", "Recovery canvas generated", mode=session["session_mode"]
    )
    await manager.send_to_counselors(req.session_id, {
        "type": RECOVERY_READY, "session_id": req.session_id, "recovery": recovery
    })
    await manager.send_to_patient(req.session_id, {
        "type": RECOVERY_READY, "session_id": req.session_id, "recovery": recovery
    })
    if timeline_event:
        await manager.send_to_counselors(req.session_id, {
            "type": TIMELINE_EVENT,
            "session_id": req.session_id,
            "event": timeline_event,
        })
    return recovery
