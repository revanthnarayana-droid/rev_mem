import asyncio
import httpx

BASE = "http://localhost:8000"
SESSION = "demo-session-nafsia-2026"

demo_messages = [
    "Hi, I just wanted to talk to someone",
    "I have been feeling really off lately",
    "It is hard to explain. I just feel stuck",
    "I do not really enjoy things the way I used to",
    "Sometimes I wonder if things will ever get better",
]


async def seed():
    async with httpx.AsyncClient(timeout=30.0) as c:
        await c.post(f"{BASE}/session/start", json={
            "session_id": SESSION, "mood": "low", "baseline_score": 7
        })
        print(f"Session {SESSION} created")
        for msg in demo_messages:
            r = await c.post(f"{BASE}/analyze", json={"message": msg, "session_id": SESSION})
            d = r.json()
            print(f"  {msg[:40]} -> risk:{d['risk_score']} emotion:{d['emotion']}")
            await asyncio.sleep(0.5)
        print("Done. Open counselor dashboard — EKG history will populate.")


asyncio.run(seed())
