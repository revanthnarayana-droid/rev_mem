from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from websocket.manager import manager
from websocket.events import *
from routes import chat, analyze, recovery, soap, sos
from store.session_store import store
import asyncio
import json

app = FastAPI(title="NAFSIA")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(chat.router)
app.include_router(analyze.router)
app.include_router(recovery.router)
app.include_router(soap.router)
app.include_router(sos.router)


@app.get("/health")
async def health():
    return {"status": "NAFSIA online", "sessions": manager.get_active_sessions()}


@app.post("/session/start")
async def start_session(data: dict):
    session_id = data.get("session_id")
    mood = data.get("mood", "unknown")
    baseline = data.get("baseline_score", 5.0)
    store.create_session(session_id, mood, baseline)
    timeline_event = store.get_timeline_events(session_id)[-1]
    await manager.broadcast_to_all_counselors({
        "type": "session_started",
        "session_id": session_id,
        "patient_mood": mood,
        "baseline_score": baseline
    })
    await manager.broadcast_to_all_counselors({
        "type": TIMELINE_EVENT,
        "session_id": session_id,
        "event": timeline_event,
    })
    return {"status": "created", "session_id": session_id}


@app.websocket("/ws/patient/{session_id}")
async def patient_ws(ws: WebSocket, session_id: str):
    await manager.connect_patient(session_id, ws)
    for event in store.get_timeline_events(session_id):
        await manager.send_to_patient(
            session_id,
            {"type": TIMELINE_EVENT, "session_id": session_id, "event": event},
        )
    await manager.send_to_counselors(
        session_id, {"type": SESSION_STARTED, "session_id": session_id}
    )
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            await manager.send_to_counselors(
                session_id,
                {
                    "type": NEW_MESSAGE,
                    "session_id": session_id,
                    "role": "patient",
                    "content": msg.get("content", ""),
                    "analysis": msg.get("analysis", {}),
                    "timestamp": msg.get("timestamp"),
                },
            )
    except WebSocketDisconnect:
        manager.disconnect_patient(session_id)
        await asyncio.sleep(2.0)
        session = manager.sessions.get(session_id, {})
        if session.get("patient") is None:
            timeline_event = store.add_timeline_event(
                session_id, "session_ended", "Patient disconnected", mode=store.get_session_mode(session_id)
            )
            await manager.send_to_counselors(
                session_id, {"type": SESSION_ENDED, "session_id": session_id}
            )
            if timeline_event:
                await manager.send_to_counselors(
                    session_id,
                    {"type": TIMELINE_EVENT, "session_id": session_id, "event": timeline_event},
                )
                await manager.send_to_patient(
                    session_id,
                    {"type": TIMELINE_EVENT, "session_id": session_id, "event": timeline_event},
                )


@app.websocket("/ws/counselor/{session_id}")
async def counselor_ws(ws: WebSocket, session_id: str):
    await manager.connect_counselor(session_id, ws)
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            t = msg.get("type")
            if t == COUNSELOR_JOINED:
                mode = msg.get("mode", "human")
                if mode not in {"ai", "copilot", "human"}:
                    mode = "human"
                store.set_session_mode(session_id, mode)
                timeline_event = store.add_timeline_event(
                    session_id,
                    "intervention_mode_changed",
                    f"Counselor switched session to {mode}",
                    mode=mode,
                )
                await manager.send_to_patient(
                    session_id,
                    {
                        "type": SESSION_MODE_CHANGED,
                        "mode": mode,
                        "message": "A counselor has joined your session."
                        if mode == "human"
                        else "A counselor is quietly co-piloting your session.",
                    },
                )
                await manager.send_to_counselors(
                    session_id,
                    {
                        "type": COUNSELOR_JOINED,
                        "session_id": session_id,
                        "mode": mode,
                    },
                )
                if timeline_event:
                    await manager.send_to_counselors(
                        session_id,
                        {"type": TIMELINE_EVENT, "session_id": session_id, "event": timeline_event},
                    )
                    await manager.send_to_patient(
                        session_id,
                        {"type": TIMELINE_EVENT, "session_id": session_id, "event": timeline_event},
                    )
            elif t == COUNSELOR_LEFT:
                store.set_session_mode(session_id, "ai")
                timeline_event = store.add_timeline_event(
                    session_id, "intervention_mode_changed", "AI resumed the session", mode="ai"
                )
                await manager.send_to_patient(
                    session_id,
                    {
                        "type": SESSION_MODE_CHANGED,
                        "mode": "ai",
                        "message": "Your AI companion has resumed.",
                    },
                )
                await manager.send_to_counselors(
                    session_id, {"type": COUNSELOR_LEFT, "session_id": session_id}
                )
                if timeline_event:
                    await manager.send_to_counselors(
                        session_id,
                        {"type": TIMELINE_EVENT, "session_id": session_id, "event": timeline_event},
                    )
                    await manager.send_to_patient(
                        session_id,
                        {"type": TIMELINE_EVENT, "session_id": session_id, "event": timeline_event},
                    )
            elif t == COUNSELOR_MESSAGE:
                await manager.send_to_patient(
                    session_id,
                    {"type": COUNSELOR_MESSAGE, "content": msg.get("content", "")},
                )
    except WebSocketDisconnect:
        manager.disconnect_counselor(session_id, ws)


@app.websocket("/ws/counselor-hub")
async def counselor_hub(ws: WebSocket):
    await manager.connect_counselor_hub(ws)
    try:
        while True:
            data = await ws.receive_text()
            msg = json.loads(data)
            t = msg.get("type")
            session_id = msg.get("session_id")
            if not session_id:
                continue
            if t == COUNSELOR_JOINED:
                mode = msg.get("mode", "human")
                if mode not in {"ai", "copilot", "human"}:
                    mode = "human"
                store.set_session_mode(session_id, mode)
                timeline_event = store.add_timeline_event(
                    session_id,
                    "intervention_mode_changed",
                    f"Counselor switched session to {mode}",
                    mode=mode,
                )
                await manager.send_to_patient(
                    session_id,
                    {
                        "type": SESSION_MODE_CHANGED,
                        "mode": mode,
                        "message": "A counselor has joined your session."
                        if mode == "human"
                        else "A counselor is quietly co-piloting your session.",
                    },
                )
                await manager.send_to_counselors(
                    session_id,
                    {
                        "type": COUNSELOR_JOINED,
                        "session_id": session_id,
                        "mode": mode,
                    },
                )
                if timeline_event:
                    await manager.send_to_counselors(
                        session_id,
                        {"type": TIMELINE_EVENT, "session_id": session_id, "event": timeline_event},
                    )
                    await manager.send_to_patient(
                        session_id,
                        {"type": TIMELINE_EVENT, "session_id": session_id, "event": timeline_event},
                    )
            elif t == COUNSELOR_LEFT:
                store.set_session_mode(session_id, "ai")
                timeline_event = store.add_timeline_event(
                    session_id, "intervention_mode_changed", "AI resumed the session", mode="ai"
                )
                await manager.send_to_patient(
                    session_id,
                    {
                        "type": SESSION_MODE_CHANGED,
                        "mode": "ai",
                        "message": "Your AI companion has resumed.",
                    },
                )
                await manager.send_to_counselors(
                    session_id, {"type": COUNSELOR_LEFT, "session_id": session_id}
                )
                if timeline_event:
                    await manager.send_to_counselors(
                        session_id,
                        {"type": TIMELINE_EVENT, "session_id": session_id, "event": timeline_event},
                    )
                    await manager.send_to_patient(
                        session_id,
                        {"type": TIMELINE_EVENT, "session_id": session_id, "event": timeline_event},
                    )
            elif t == COUNSELOR_MESSAGE:
                await manager.send_to_patient(
                    session_id,
                    {"type": COUNSELOR_MESSAGE, "content": msg.get("content", "")},
                )
    except WebSocketDisconnect:
        manager.disconnect_counselor_hub(ws)
