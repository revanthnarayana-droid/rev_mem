# NAFSIA

NAFSIA is a real-time mental health AI platform with two synchronized interfaces:

- `Patient`: an AI-supported emotional support experience
- `Counselor`: a live intervention dashboard for monitoring, co-pilot support, takeover, SOS escalation, SOAP generation, and recovery planning

This repository currently keeps the full application inside the [`nafsia/`](/Users/paranchittamuru/rev_mem/nafsia) folder.

## Main Features

- Real-time WebSocket sync between patient and counselor views
- NLP-based emotion, stress, suicide-risk, and psycholinguistic analysis
- Composite risk scoring with live tier escalation
- Emotional Weather Room for the patient experience
- Emotional EKG dashboard for counselors
- Rupture Timeline for replaying turning points in a session
- Intervention Cockpit with `Observe`, `Co-pilot`, and `Take over` modes
- SOS escalation with visual and audio alerts
- SOAP note generation
- Recovery Canvas generation
- In-memory session store with no Firebase / Firestore

## Project Location

The active application code lives here:

- project folder: [`nafsia/`](/Users/paranchittamuru/rev_mem/nafsia)
- project README: [`nafsia/README.md`](/Users/paranchittamuru/rev_mem/nafsia/README.md)

## Quick Start

### Backend

```bash
cd nafsia/backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python -m spacy download en_core_web_sm
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd nafsia/frontend
npm install
npm start
```

Open:

- frontend: [http://localhost:3000](http://localhost:3000)
- backend health: [http://localhost:8000/health](http://localhost:8000/health)

## Notes

- realtime transport is WebSockets only
- there is no Firebase in this project
- current session storage is in-memory and resets on backend restart
