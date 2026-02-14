# TriageSense Frontend

React frontend for TriageSense. Connects to the backend API for diagnosis, hospitals, wait times, and ranking.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev
```

Runs at http://localhost:5173

## Build

```bash
npm run build
```

## API URL

By default the frontend calls `http://localhost:5000`. If your backend runs on a different port:

- Create `.env` in the frontend folder
- Set `REACT_APP_API_URL=http://localhost:3000` (or your backend URL)
