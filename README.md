![9layer Logo](frontend/public/Frame%202.png)

# 9layer — Local Music Library + Player (Backend + Frontend)

9layer is a local-first music player with a TypeScript backend and a modern Next.js frontend. It plays audio files from your machine that are indexed in a PostgreSQL database.

Important: You must have music files available locally for playback. The in-app YouTube download feature is experimental/untested and may not work yet.

## Features
- Local library playback with queue and controls
- Search across artists/albums/tracks
- Modern UI built with Tailwind and shadcn/ui
- TypeScript/Fastify backend with Prisma + PostgreSQL
- REST API integration (WebSocket realtime planned)

## Architecture
- `backend-ts/` — Fastify (TypeScript), Prisma ORM, PostgreSQL
- `frontend/` — Next.js app (runs on port 3004 by default)
- Shared: audio files reside on your filesystem; DB stores metadata and file paths

## Prerequisites
- Node.js 18+
- PostgreSQL 14+
- ffmpeg (recommended for future/optional conversion)

macOS:
```bash
brew install postgresql@14 ffmpeg
```

Ubuntu/Debian:
```bash
sudo apt update
sudo apt install postgresql-14 ffmpeg
```

## Database Setup
Create a database and user (or use `setup_postgres.sql` in the repo as a reference):
```sql
CREATE DATABASE music_player;
CREATE USER music_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE music_player TO music_user;
```

## Backend Setup (`backend-ts/`)
1) Install deps
```bash
npm install
```

2) Environment
Create `backend-ts/.env` (see `.env.example` if present):
```
DATABASE_URL=postgresql://music_user:your_secure_password@localhost:5432/music_player
PORT=8000
CORS_ORIGIN=http://localhost:3004
```

If you change the frontend port, remember to update `CORS_ORIGIN` so it matches.

3) Prisma
```bash
npx prisma generate
npx prisma migrate dev
```

4) Run the server
```bash
npm run dev
# Server listens on http://localhost:8000
```

Notes:
- REST endpoints for playback/queue/search are under `backend-ts/src/routes/` (e.g. `playback.routes.ts`).
- WebSocket support is planned; a polling fallback is used by the frontend today.

## Frontend Setup (`frontend/`)
1) Install deps
```bash
npm install
```

2) Environment (if used)
Create `frontend/.env.local` and point to the backend:
```
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

3) Run the app
```bash
npm run dev
# By default opens at http://localhost:3000 (falls back to 3001/3002/... if busy)
```

## Adding Music (Required)
You need audio files on disk and corresponding rows in PostgreSQL so the player can find and play them.

Options:
1) Manual library entries (recommended for now)
   - Place audio files (mp3/webm/opus) on your filesystem.
   - Insert track metadata and absolute file paths into the DB using Prisma Studio:
    ```bash
    npx prisma studio
    ```
   - Or write a small seed script to create `Artist`, `Album`, `Track` records.

2) In-app YouTube downloader (experimental)
   - The UI exposes a download form, but this path is not fully tested and may fail.
   - If you try it, ensure ffmpeg is installed. Expect bugs; contributions are welcome.

## Usage
- **Start servers together**
  1. From the repository root, run `npm install -g .` once to link the command.
  2. Afterwards run `9layer` to launch both servers. The backend binds to `http://localhost:8000`. The frontend will try `http://localhost:3000` first and automatically fall back to `3001`, `3002`, etc. if earlier ports are busy.
  3. Stop both servers any time with `9layer end` (from any directory).
- **Manual start (optional)**
  - Start backend on 8000 and frontend on 3000 (or the next available open port) individually if you prefer.
- **Play music**
  - Open the app, use search to locate tracks, and click play.
  - Player supports previous/next, volume, and auto-advance after a user interaction (browser policy).

## Troubleshooting
- "No supported source" errors: ensure your file paths are valid, files exist, and the backend returns correct `content-type` (e.g., `audio/mpeg`).
- CORS: confirm `CORS_ORIGIN` matches whichever frontend URL you are using (e.g. `http://localhost:3000`) and the frontend points to `http://localhost:8000`.
- Test file: open `frontend/public/audio-test.html` in a browser to confirm your browser can play basic audio.

## Project Structure (key parts)
```
9layer/
├── backend-ts/
│   ├── prisma/
│   └── src/
├── frontend/
│   ├── public/
│   └── src/
├── setup_postgres.sql
└── README.md
```

## Contributing
Issues and PRs are welcome. Areas of focus: downloader reliability, WebSocket realtime updates, library import tools.

## License
MIT
