# HackFax2026 / TriageSense

TriageSense is a full-stack web app that helps users describe symptoms, get a fast AI-generated triage-style summary (condition, severity 1-3, reasoning, and next steps), and then find nearby hospitals with estimated wait times and directions. Logged-in users can store basic profile info and emergency contacts in MongoDB, and for maximum severity results (3/3) the backend can send a diagnosis synopsis email to an emergency contact via SMTP.

## Tech Stack

- Frontend: React + Vite (`frontend/`)
- Backend: Node.js + Express (`backend/`)
- Database: MongoDB (Mongoose models)
- Maps: Leaflet + OpenStreetMap tiles
- AI diagnosis: Google Gemini (via API key)
- Text-to-speech: ElevenLabs (optional, via API key; browser TTS fallback exists)
- Audio transcription: backend endpoint `/transcribe-audio` (requires the server route to be running/configured)
- Wait times: backend web-scrapes hospital wait-time pages and normalizes them to JSON
- Email alerts: Nodemailer via SMTP (Gmail App Password supported)

## Architecture (Mermaid)

```mermaid
flowchart TD
  U[User Browser] -->|React UI| FE[Frontend (Vite/React)]

  FE -->|Auth: signup/login/me/profile| API_AUTH[Express API /auth/*]
  FE -->|Diagnose| API_DIAG[Express API POST /diagnose]
  FE -->|Hospitals + waittimes + ranking| API_MISC[Express API /hospitals /waittimes /rank]
  FE -->|TTS + Transcribe| API_MEDIA[Express API /tts /transcribe-audio]

  subgraph BE[Backend (Node/Express)]
    API_AUTH --> DB[(MongoDB)]
    API_DIAG --> LLM[Gemini Diagnosis Service]
    API_DIAG --> DB
    API_MISC --> MAPS[Maps/Geo + Hospital Search]
    API_MISC --> SCRAPE[Wait-Time Scraper]
    API_MEDIA --> TTS[ElevenLabs TTS]
    API_MEDIA --> TRANSCRIBE[Audio Transcription Route]
    API_DIAG -->|severity 3/3| EMAIL[Nodemailer SMTP Email]
  end

  SCRAPE --> WEB[Hospital Websites (HTML)]
  EMAIL --> SMTP[(SMTP Provider, e.g. Gmail)]
```

## Local Development

### 1) Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 2) Configure environment variables

Backend env file: `backend/.env`

Required for core features:
- `MONGODB_URI` (MongoDB connection string)
- `GEMINI_API_KEY` (AI diagnosis)

Optional:
- `ELEVENLABS_API_KEY` (TTS; browser fallback works without it)
- SMTP (email alerts for severity 3/3):
  - `SMTP_HOST` (e.g. `smtp.gmail.com`)
  - `SMTP_PORT` (e.g. `587`)
  - `SMTP_USER` (sender email)
  - `SMTP_PASS` (Gmail App Password, 16 chars, no spaces)
  - `SMTP_FROM` (usually same as `SMTP_USER`)

Frontend env file: `frontend/.env`

Common options:
- `VITE_API_URL=http://localhost:4000` (call backend directly)
- `VITE_PROXY_TARGET=http://localhost:4000` (use dev proxy via `/api`)

### 3) Start backend

```bash
cd backend
npm start
```

Notes:
- Default backend port is controlled by `backend/.env` `PORT` (this repo commonly uses `4000`).
- The backend may auto-increment the port if the base port is in use.

### 4) Start frontend (Vite)

```bash
cd frontend
npm run dev
```

Frontend default: `http://localhost:5173`

## Production Build (Serve `frontend/dist`)

Build frontend:

```bash
cd frontend
npm run build
```

The backend serves `frontend/dist` as static files when running `backend/server.js`.

## Key Routes

- Auth/profile:
  - `POST /auth/signup`
  - `POST /auth/login`
  - `GET /auth/me`
  - `PUT /auth/profile`
- Diagnose:
  - `POST /diagnose` (optional auth; if logged in, can use profile and send emergency email on 3/3)
- Hospitals + timing:
  - `POST /hospitals`
  - `POST /waittimes`
  - `POST /rank`
- Media:
  - `POST /tts`
  - `POST /transcribe-audio`

## Troubleshooting

- Frontend says it saved profile but MongoDB doesn't change:
  - Make sure the frontend is talking to the correct backend port (backend can auto-shift ports if the base port is busy).
- No emergency email:
  - Verify `SMTP_USER/SMTP_PASS/SMTP_FROM` are set.
  - Gmail requires a 16-character App Password (2FA must be enabled).
  - Emails only send for severity `3/3` and a valid emergency contact email.
