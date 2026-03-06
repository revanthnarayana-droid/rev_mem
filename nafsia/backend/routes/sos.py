from fastapi import APIRouter
from pydantic import BaseModel
from datetime import datetime
from websocket.manager import manager
from websocket.events import SOS_FIRED
from store.session_store import store

router = APIRouter()


class SOSRequest(BaseModel):
    session_id: str
    message: str = "Patient triggered SOS"


@router.post("/sos")
async def trigger_sos(req: SOSRequest):
    store.flag_sos(req.session_id)

    helplines = [
        {"name": "iCall", "number": "9152987821", "hours": "Mon-Sat 8am-10pm"},
        {"name": "NIMHANS", "number": "080-46110007", "hours": "24/7"},
        {"name": "Vandrevala Foundation", "number": "1860-2662-345", "hours": "24/7"},
        {"name": "AASRA", "number": "9820466627", "hours": "24/7"},
    ]

    await manager.broadcast_to_all_counselors({
        "type": SOS_FIRED,
        "session_id": req.session_id,
        "timestamp": datetime.utcnow().isoformat(),
        "message": req.message,
        "helplines": helplines,
        "severity": "EMERGENCY"
    })

    return {
        "acknowledged": True,
        "message": "Help is on the way. You are not alone.",
        "helplines": helplines
    }
