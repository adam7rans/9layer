# 9layer Frontend (Next.js)

This is the 9layer web UI built with Next.js. It connects to the TypeScript backend to play local audio files from your library.

Important: You must have music files indexed in the database by the backend. The in-app YouTube downloader is experimental/untested and may not work yet.

## Prerequisites
- Backend running at `http://localhost:8000` (see `../README.md` for setup)
- Node.js 18+

## Environment
Create `.env.local` to point to the backend:
```
NEXT_PUBLIC_API_BASE=http://localhost:8000
```

## Run
```bash
npm install
npm run dev
# Open http://localhost:3004
```

The app uses polling to keep playback state in sync until WebSocket support is enabled on the backend.

## Usage
- Use search to find tracks; click play to start playback.
- Player supports previous/next, volume, and auto-advance.
- Due to browser autoplay policies, interact with the page (click/keypress) before pressing Play.

## Troubleshooting
- No audio: ensure the backend is running and the DB has valid file paths to existing audio files.
- CORS/Network: verify the backend allows origin `http://localhost:3004`.
- Unsupported source: confirm file format (mp3/webm/opus) and backend `content-type`.

## Contributing
UI uses Tailwind + shadcn/ui + Lucide icons. PRs welcome.
