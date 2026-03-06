from fastapi import WebSocket
from typing import Dict, List
import json


class ConnectionManager:
    def __init__(self):
        self.sessions: Dict[str, dict] = {}
        self.counselor_hubs: List[WebSocket] = []

    def _ensure_session(self, session_id: str):
        if session_id not in self.sessions:
            self.sessions[session_id] = {"patient": None, "counselors": []}

    async def connect_patient(self, session_id: str, ws: WebSocket):
        await ws.accept()
        self._ensure_session(session_id)
        self.sessions[session_id]["patient"] = ws

    async def connect_counselor(self, session_id: str, ws: WebSocket):
        await ws.accept()
        self._ensure_session(session_id)
        self.sessions[session_id]["counselors"].append(ws)

    async def connect_counselor_hub(self, ws: WebSocket):
        await ws.accept()
        self.counselor_hubs.append(ws)

    def disconnect_patient(self, session_id: str):
        if session_id in self.sessions:
            self.sessions[session_id]["patient"] = None

    def disconnect_counselor(self, session_id: str, ws: WebSocket):
        if session_id in self.sessions:
            try:
                self.sessions[session_id]["counselors"].remove(ws)
            except ValueError:
                pass

    def disconnect_counselor_hub(self, ws: WebSocket):
        try:
            self.counselor_hubs.remove(ws)
        except ValueError:
            pass

    async def send_to_patient(self, session_id: str, data: dict):
        ws = self.sessions.get(session_id, {}).get("patient")
        if ws:
            try:
                await ws.send_text(json.dumps(data))
            except Exception as e:
                print(f"[WS] Patient send failed: {e}")

    async def send_to_counselors(self, session_id: str, data: dict):
        counselors = list(self.sessions.get(session_id, {}).get("counselors", []))
        for ws in self.counselor_hubs:
            if ws not in counselors:
                counselors.append(ws)
        dead = []
        for ws in counselors:
            try:
                await ws.send_text(json.dumps(data))
            except:
                dead.append(ws)
        for ws in dead:
            if session_id in self.sessions and ws in self.sessions[session_id]["counselors"]:
                self.sessions[session_id]["counselors"].remove(ws)
            self.disconnect_counselor_hub(ws)

    async def broadcast_to_all_counselors(self, data: dict):
        dead = []
        sent = set()
        for ws in self.counselor_hubs:
            try:
                await ws.send_text(json.dumps(data))
                sent.add(id(ws))
            except:
                dead.append(ws)
        for sid, session in self.sessions.items():
            for ws in session["counselors"]:
                if id(ws) in sent:
                    continue
                try:
                    await ws.send_text(json.dumps(data))
                except:
                    dead.append(ws)
        for ws in dead:
            self.disconnect_counselor_hub(ws)
            for session in self.sessions.values():
                if ws in session["counselors"]:
                    session["counselors"].remove(ws)

    def get_active_sessions(self) -> List[dict]:
        return [
            {
                "session_id": sid,
                "patient_connected": s["patient"] is not None,
                "counselor_count": len(s["counselors"]),
            }
            for sid, s in self.sessions.items()
        ]


manager = ConnectionManager()
