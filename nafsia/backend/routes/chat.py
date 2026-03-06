from fastapi import APIRouter
from pydantic import BaseModel
import os
from openai import OpenAI
from dotenv import load_dotenv
from models.technique_router import TechniqueRouter
from store.session_store import store
from websocket.manager import manager
from websocket.events import NEW_MESSAGE

load_dotenv()
router = APIRouter()
client = OpenAI(
    api_key=os.getenv("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1",
)
tr = TechniqueRouter()

BASE_SYSTEM = """You are NAFSIA, a compassionate AI mental health companion. Not a replacement for professional care.
RULES:
- Validate feelings before anything else
- Never use toxic positivity
- Never say "I understand" — say "It sounds like" or "That makes sense"
- Keep responses under 4 sentences unless the person clearly needs more
- Always end with one open question inviting continued sharing
- Never diagnose or prescribe
Patient emotion: {emotion}
Risk level: {risk}/10
"""

CRISIS_ADDITION = """
CRITICAL: This person may be in crisis.
1. Acknowledge their pain warmly in one sentence
2. Gently mention a counselor is available right now
3. Provide: iCall 9152987821
Be human. Not alarming.
"""


class ChatRequest(BaseModel):
    message: str
    session_id: str
    technique: str = "ROGERIAN"
    emotion: str = "neutral"
    risk_score: float = 0.0


@router.post("/chat")
async def chat(req: ChatRequest):
    if store.get_session_mode(req.session_id) == "human":
        return {
            "response": "", "technique": req.technique,
            "technique_color": "#888888",
            "session_id": req.session_id, "ai_silenced": True
        }

    system = BASE_SYSTEM.format(emotion=req.emotion, risk=req.risk_score)
    system += tr.get_system_prompt_addition(req.technique)
    if req.risk_score >= 7.5:
        system += CRISIS_ADDITION

    history = store.get_chat_history(req.session_id, last_n=8)
    payload = [{"role": "system", "content": system}] + history + [{"role": "user", "content": req.message}]

    completion = client.chat.completions.create(
        model="llama-3.3-70b-versatile", messages=payload, max_tokens=300, temperature=0.7
    )
    response_text = completion.choices[0].message.content.strip()

    session = store.get_session(req.session_id)
    last_message = session["messages"][-1] if session and session["messages"] else None
    if not last_message or last_message["role"] != "patient" or last_message["content"] != req.message:
        store.append_message(req.session_id, "patient", req.message)
    store.append_message(req.session_id, "assistant", response_text)

    await manager.send_to_counselors(req.session_id, {
        "type": NEW_MESSAGE, "session_id": req.session_id,
        "role": "assistant", "content": response_text
    })

    colors = {"CBT": "#4A9EFF", "DBT": "#FF6B35", "MI": "#00FFB2", "ROGERIAN": "#A855F7"}
    return {
        "response": response_text,
        "technique": req.technique,
        "technique_color": colors.get(req.technique, "#888"),
        "session_id": req.session_id,
        "ai_silenced": False
    }
