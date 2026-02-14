# HackFax2026 / TriageSense

## Frontend

```bash
cd frontend && npm install && npm run dev
```

See `frontend/README.md` for details.

## Backend

```bash
cd backend && npm install && npm start
```

1. Start the backend first (default port 3000).
2. Start the frontend. It proxies `/api` to `http://localhost:3000`.
3. If the backend runs on a different port (e.g. 30000), create `frontend/.env` with:
   `VITE_PROXY_TARGET=http://localhost:30000`
4. Set `GEMINI_API_KEY` and `ELEVENLABS_API_KEY` in `backend/.env` for diagnosis and TTS.