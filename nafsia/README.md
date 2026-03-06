# NAFSIA

NAFSIA is a real-time mental health support platform with two coordinated interfaces:

- `Patient`: an AI-supported conversation space that reacts to emotional risk in real time
- `Counselor`: a live intervention dashboard for monitoring, takeover, co-pilot support, SOS escalation, SOAP generation, and recovery planning

The platform is built around FastAPI, React, and WebSockets only. There is no Firebase in this project.

## What NAFSIA Does

NAFSIA combines live NLP analysis, therapist-style AI responses, and counselor escalation workflows into one synchronized system.

It is designed to answer a practical question:

How do you detect risk early, visually surface deterioration, and hand the conversation to a human before the situation gets worse?

## Core Features

### Patient Experience

- Role-based login and guided session entry
- Mood check-in with baseline score before the chat begins
- Real-time patient chat over WebSockets
- Dynamic AI responses routed by technique:
  - `CBT`
  - `DBT`
  - `MI`
  - `ROGERIAN`
- Emotional Weather Room:
  - the chat environment changes visually with risk tier, emotion, velocity, and intervention mode
- Live side panel showing:
  - detected mood
  - baseline mood
  - risk score and tier
  - velocity direction
  - detected stress
  - technique
  - current intervention mode
- Silent-signal detection for disengagement patterns
- SOS emergency trigger with a patient-facing support overlay
- Counselor join / co-pilot / takeover awareness in real time
- Recovery Canvas after session close

### Counselor Experience

- Live counselor dashboard with active sessions list
- Real-time alert log for:
  - watch
  - concern
  - crisis
  - silent signal
  - SOS emergency
- Emotional EKG chart with:
  - score trend
  - velocity overlay
  - watch and crisis thresholds
- Session thumbnails that mirror the patient’s live visual state
- Rupture Timeline:
  - baseline
  - spikes
  - alerts
  - silent signals
  - intervention mode changes
  - SOS
  - SOAP / recovery completion
- Clickable timeline events that focus the relevant conversation moment
- Intervention Cockpit with 3 modes:
  - `Observe`
  - `Co-pilot`
  - `Take over`
- Counselor compose panel for direct patient messaging
- Co-pilot draft suggestions for counselor-only review
- SOAP note generation
- Recovery Canvas rendering
- SOS audio alarm on the counselor dashboard

### AI / NLP Layer

- Emotion detection using a public Hugging Face model
- Stress detection using a public Hugging Face model
- Suicide-risk detection using a public Hugging Face model plus crisis-language overrides
- Psycholinguistic analysis for:
  - cognitive distortions
  - absolutist language
  - temporal focus
  - pronoun density
  - fragment rate
- Composite risk scoring
- Risk tiering:
  - `safe`
  - `watch`
  - `concern`
  - `crisis`
- Velocity and acceleration tracking over time
- Technique routing based on emotional state, distortions, fragmentation, and risk

### Data / Realtime Architecture

- FastAPI backend
- React frontend
- WebSocket-only realtime sync
- In-memory session store
- Session mode switching without Firebase or Firestore
- Timeline event persistence in memory for replay and visualization

## Novel Product Ideas Implemented

NAFSIA goes beyond a standard chatbot or triage dashboard through four demo-driven concepts:

### 1. Emotional Weather Room

The patient environment is not static. It visually shifts with emotional risk, deterioration, and counselor intervention.

### 2. Rupture Timeline

Counselors can see the session as a sequence of turning points, not just a message list.

### 3. Intervention Cockpit

Counselors can observe, co-pilot, or fully take over the conversation with mode-specific UI and workflow changes.

### 4. Recovery Canvas

End-of-session recovery output is rendered as a designed artifact instead of raw JSON.

## Project Structure

```text
nafsia/
├── backend/
│   ├── main.py
│   ├── models/
│   ├── routes/
│   ├── store/
│   ├── utils/
│   └── websocket/
└── frontend/
    ├── src/
    │   ├── api/
    │   ├── components/
    │   ├── screens/
    │   ├── utils/
    │   └── ws/
    └── package.json
```

## Backend Endpoints

### HTTP

- `GET /health`
- `POST /session/start`
- `POST /analyze`
- `POST /chat`
- `POST /sos`
- `POST /soap`
- `POST /recovery`

### WebSockets

- `/ws/patient/{session_id}`
- `/ws/counselor/{session_id}`
- `/ws/counselor-hub`

## Local Setup

### 1. Backend

```bash
cd nafsia/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Create a `.env` file in `nafsia/` or `nafsia/backend/` with your key:

```bash
GROQ_API_KEY=your_key_here
```

### 2. Frontend

```bash
cd nafsia/frontend
npm install
npm start
```

Open:

- frontend: [http://localhost:3000](http://localhost:3000)
- backend health: [http://localhost:8000/health](http://localhost:8000/health)

## Demo Flow

Recommended live sequence:

1. Patient logs in and selects a baseline mood
2. Counselor dashboard sees the session appear instantly
3. Patient sends progressively heavier messages
4. Risk tier and EKG update in real time
5. Counselor switches from `Observe` to `Co-pilot` or `Take over`
6. SOS triggers audio + visual escalation
7. End session generates SOAP note and Recovery Canvas

## Current Limitations

- session storage is in-memory and resets on backend restart
- NLP inference quality still depends on model availability and prompt phrasing
- this is not a diagnostic device or replacement for licensed clinical care

## Tech Stack

- FastAPI
- WebSockets
- React
- Recharts
- spaCy
- Transformers
- Torch
- Groq OpenAI-compatible API

## License / Usage

This project is currently presented as a demo/hackathon-style application. Add the license of your choice before wider public distribution.
