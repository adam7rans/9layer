# Development Log

This file tracks development progress, features implemented, and issues resolved during the 9layer project development.

## 2025-10-12 - Playlist metadata sanitization and wrap workflow update

**Problem:** YouTube playlist downloads stored albums as `"Topic"` or raw playlist IDs (e.g., `"Playlist OLAK5uy_"`), leaving the download UI and library with incorrect album names.

**Root Cause:** `YTDlpWrapper.parseVideoInfo()` prioritized `playlist_title` metadata without cleaning generic suffixes, and playlist queueing reused unsanitized titles when seeding download jobs. Wrap-up documentation also lacked guidance to refresh the README when workflows changed.

**Solution:**
1. Expanded `backend/src/utils/yt-dlp.ts` to prefer artist/album fields, strip `"- Topic"` suffixes, and ignore generic playlist placeholders.
2. Updated `backend/src/routes/download.routes.ts` to sanitize playlist-level album names, reuse cleaned per-track metadata, and avoid embedding playlist IDs in overrides.
3. Documented the improvements in `README.md` and amended `.claude/commands/wrap.md` so session wrap-ups include README updates alongside the dev log entry.

**Files Modified:**
- `/backend/src/utils/yt-dlp.ts`
- `/backend/src/routes/download.routes.ts`
- `/README.md`
- `/.claude/commands/wrap.md`

**Outcome:** Playlist downloads now populate accurate artist and album titles across the download UI and library, while contributors follow a clearer wrap workflow that keeps both the dev log and README current.

## 2025-10-12 - Playback analytics polish and sequential queue mode

**Problem:** Top-tracks analytics still relied on mixed score metrics, sequential playback ignored album order, and timeline tooltips obscured the waveform while recent playback lacked immediate visual feedback.

**Root Cause:** `getUserTopTracks()` continued including unrated tracks and non-rating metrics, the player never hydrated an album-based queue when toggling sequential mode, and the heatmap tooltip positioned above the SVG while real-time analytics segments were only visible after page reload.

**Solution:**
1. Reworked `backend/src/services/analytics.service.ts` and `backend/src/routes/analytics.routes.ts` so top tracks filter to positive ratings and expose detailed play counts and duration stats.
2. Updated `frontend/src/components/IntegratedPlayer.tsx`, `frontend/src/components/AnalyticsDashboard.tsx`, and `frontend/src/lib/api.ts` to surface per-track listening stats, fetch rating-only analytics, and build sequential album queues with proper next/previous handling alongside new toast notifications for ratings and downloads.
3. Tweaked `frontend/src/components/HeatmapTimeline.tsx`, `frontend/src/app/layout.tsx`, and related package files to relocate the tooltip below the timeline and enable dark-themed `sonner` toasts across the app.

**Files Modified:**
- `/README.md`
- `/backend/src/routes/analytics.routes.ts`
- `/backend/src/services/analytics.service.ts`
- `/frontend/package.json`
- `/frontend/package-lock.json`
- `/frontend/src/app/layout.tsx`
- `/frontend/src/components/AnalyticsDashboard.tsx`
- `/frontend/src/components/HeatmapTimeline.tsx`
- `/frontend/src/components/IntegratedPlayer.tsx`
- `/frontend/src/lib/api.ts`

**Outcome:** Analytics rankings now reflect user ratings only, the player delivers consistent album-order playback with rich listening stats, and users receive immediate dark-themed toast feedback while heatmap tooltips stay clear of the timeline.

## 2025-10-11 - Missing audio indicators for search results

**Problem:** Artists and albums containing tracks without audio files were indistinguishable in the search UI, even when every track in an album was missing.

**Root Cause:** The backend search service did not consistently populate nullable media fields or expose missing-track counts for aggregate entities, and the frontend only rendered missing-audio badges for individual tracks.

**Solution:**
1. Updated `backend/src/services/search.service.ts` to always return `youtubeId` as `string | null` and to include missing-audio metadata for albums and artists.
2. Enhanced `frontend/src/components/SearchResults.tsx` to render red "All songs missing" styling for albums/artists with zero playable tracks and amber "Some tracks missing" styling when only a subset is unavailable.
3. Added contextual badges and disabled states so users can immediately see availability before drilling into album or artist detail.

**Files Modified:**
- `/backend/src/services/search.service.ts`
- `/frontend/src/components/SearchResults.tsx`

**Outcome:** Search results now highlight missing audio at the artist and album levels, helping users prioritize remediation of fully missing albums while still flagging partially incomplete catalogs.

## 2025-10-11 - Downloader stall detection and retry flow

**Problem:** Long-running YouTube downloads could stall silently, leaving the UI without guidance or recovery.

**Root Cause:** `DownloadService` lacked watchdog timers, emitted minimal failure metadata, and the frontend UI had no controls for retries or stall visibility.

**Solution:**
1. Added stall detection, timeout watchdog, missing-file checks, and richer error payloads throughout backend downloader code.
2. Exposed retry endpoints and surfaced stall/retry states plus playlist summaries in `IntegratedPlayer.tsx`.
3. Updated `start-dev.sh` to auto-detect free ports so backend/frontend launch reliably.

**Files Modified:**
- `/backend/prisma/schema.prisma`
- `/backend/src/routes/download.routes.ts`
- `/backend/src/services/download.service.ts`
- `/backend/src/types/api.types.ts`
- `/backend/src/utils/yt-dlp.ts`
- `/backend/src/routes/playback.routes.ts`
- `/frontend/src/components/IntegratedPlayer.tsx`
- `/start-dev.sh`

**Outcome:** Downloader sessions now detect stalls, emit actionable errors, and can be retried directly from the UI while the dev script finds open ports automatically.

## 2025-10-11 - Playback heatmap analytics prototype

**Problem:** Needed a track timeline heatmap similar to YouTube hotspots, but no API or frontend visualization existed.

**Root Cause:** Playback segments were stored but never aggregated; the frontend lacked components/hooks to render heatmap data.

**Solution:**
1. Added `getTrackHeatmap()` plus `/analytics/track/:trackId/heatmap` endpoint to aggregate playback segments into buckets.
2. Built `HeatmapTimeline` component with supporting hooks and integrated the data into library UI components.
3. Documented the in-progress feature and styled scroll areas to match design requirements.

**Files Modified:**
- `/backend/src/routes/analytics.routes.ts`
- `/backend/src/services/analytics.service.ts`
- `/frontend/src/components/HeatmapTimeline.tsx`
- `/frontend/src/hooks/useAnalytics.ts`
- `/frontend/src/hooks/useProgressSmoothing.ts`
- `/frontend/src/lib/api.ts`
- `/frontend/src/components/SearchResults.tsx`
- `/frontend/src/app/globals.css`
- `/____docs/features/playback-heatmap.md`

**Outcome:** Frontend can fetch and render preliminary heatmap analytics for tracks, establishing groundwork for future enhancements.

## Entries

```json
{
  "timestamp": "2025-09-26T10:42:30Z",
  "description": "chore: streamline dev environment launcher commands",
  "details": "Created a repository-level CLI workflow so `9layer` launches both dev servers with automatic frontend port detection and added a companion `9layer end` subcommand that cleanly stops the Fastify and Next.js processes. Improved `start-dev.sh` with port auto-increment logic, PID cleanup, and symlink resolution. Updated the README usage docs to describe the new start/stop commands and clarified CORS configuration guidance.",
  "tags": ["backend", "frontend", "setup", "tooling", "documentation"],
  "files_modified": [
    "start-dev.sh",
    "README.md",
    "package.json"
  ]
},
{
  "timestamp": "2025-09-23T10:28:00Z",
  "description": "fix: resolve audio playback error and complete external drive migration",
  "details": "Fixed audio playback issues after external drive migration by correcting database configuration and file paths. Updated DATABASE_URL from music_player to 9layer_dev database, migrated music library (16GB, 2,935 tracks) from local directory to external drive (/Volumes/2TB/coding tools/9layer/music), and verified all database file paths point to external drive. Renamed backend-ts directory to backend for simplicity and updated all configuration files. Cleaned up repository by removing old Python backend infrastructure, documentation files, and development debug scripts. Fixed VSCode Python extension issues by disabling Python features for this TypeScript-only workspace. Resolved 'failed to fetch random song' error by ensuring correct database connection and verified audio streaming endpoints work properly from external drive.",
  "tags": ["backend", "database", "migration", "audio", "bugfix", "cleanup", "devops"],
  "files_modified": [
    ".env",
    ".gitignore",
    "CLAUDE.md",
    "backend/.env",
    ".vscode/settings.json",
    "____docs/dev_diary/devlog.md"
  ]
},
{
  "timestamp": "2025-09-22T13:47:00Z",
  "description": "fix: resolve search results layout and visibility issues",
  "details": "Fixed critical search results display issues where individual sections had scroll bars and content was hidden. Corrected responsive breakpoint from lg: to sm: so three-column layout appears on desktop (>640px) while mobile shows stacked layout. Removed all overflow restrictions, max-height constraints, and scroll bars from Artists, Albums, and Songs sections, ensuring all search results are fully visible without scrolling within individual sections. Users can now see all artists, all albums, and all songs in their respective sections without truncation.",
  "tags": ["frontend", "ui", "search", "responsive", "bugfix", "layout"],
  "files_modified": [
    "frontend/src/components/SearchResults.tsx",
    "frontend/src/components/IntegratedPlayer.tsx"
  ]
},
{
  "timestamp": "2025-09-18T08:10:00Z",
  "description": "feat: implement comprehensive real-time search with separate columns for artists, albums, and songs",
  "details": "Built complete enhanced search functionality with real-time filtering across entire database. Created new SearchService with separate methods for artists, albums, and tracks using Prisma ORM with case-insensitive search and proper relationships. Added three new API endpoints (/search/all, /search/artist/:id/tracks, /search/album/:id/tracks) with comprehensive schema validation. Implemented SearchResults React component with three-column responsive layout (Artists | Albums | Songs) featuring 300ms debounced search, click-to-play functionality, and proper error handling. Enhanced Library tab to replace simple track list with powerful search interface supporting artist/album playback that switches to sequential mode. Added search interfaces to TypeScript definitions and updated API client with search methods. Fixed API_BASE configuration to use correct port 8001 and resolved CORS/connectivity issues.",
  "tags": ["backend", "frontend", "feature", "search", "database", "ui", "api", "websocket"],
  "files_modified": [
    "backend-ts/src/services/search.service.ts",
    "backend-ts/src/routes/playback.routes.ts",
    "backend-ts/src/types/api.types.ts",
    "frontend/src/components/SearchResults.tsx",
    "frontend/src/components/IntegratedPlayer.tsx",
    "frontend/src/lib/api.ts"
  ]
}
```

```json
{
  "timestamp": "2025-09-18T07:10:00Z",
  "description": "fix: resolve download progress bar issues and implement album completion with Play Album functionality",
  "details": "Fixed jerky progress bar updates that showed fake animations (0% → 5% → 100%), implemented smooth real-time progress tracking with improved throttling (0.1%/100ms). Added comprehensive album completion tracking system that detects when playlists finish downloading and provides Play Album button with sequential playback. Fixed Unknown Album display issue by implementing better playlist metadata extraction with multiple fallback strategies (playlist title → playlist ID). Implemented track ID-based filtering system for Play Album functionality to resolve track matching errors. Added client-side progress smoothing hook and improved SSE event handling for album completion notifications.",
  "tags": ["backend", "frontend", "bugfix", "feature", "progress", "player", "websocket", "download"],
  "files_modified": [
    "backend-ts/src/services/download.service.ts",
    "backend-ts/src/routes/download.routes.ts",
    "backend-ts/src/utils/yt-dlp.ts",
    "backend-ts/src/types/api.types.ts",
    "frontend/src/components/IntegratedPlayer.tsx",
    "frontend/src/hooks/useProgressSmoothing.ts",
    "frontend/src/components/PlaybackTimeline.tsx"
  ]
}
```

```json
{
  "timestamp": "2025-09-01T18:45:00Z",
  "description": "fix: resolve volume control scaling, snapping, and default issues",
  "details": "Fixed three critical volume control issues: (1) 3300% scaling error by adding proper volume clamping to 0-1 range before multiplication, (2) slider handle snapping behavior by extending polling disable period from 2 to 3 seconds and improving volume normalization logic, (3) unreasonable default volume (10000%) by adding initialization effect to detect and correct backend volume >100. Enhanced volume handling with smart normalization that handles mixed 0-100 and 0-1 scales gracefully. Added defensive programming with multiple layers of validation to prevent display errors.",
  "tags": ["frontend", "bugfix", "volume-control", "ui", "analytics", "player"],
  "files_modified": [
    "frontend/src/components/IntegratedPlayer.tsx"
  ]
}
```

```json
{
  "timestamp": "2025-08-30T23:08:24+02:00",
  "description": "feat/ui+fix: add 'Play on this device' button, enable LAN/mobile via dynamic API base and dev CORS",
  "details": "Reintroduced and repositioned the local playback control as a clear button labeled 'Play on this device' under the track metadata. Switched frontend to a dynamic API base (NEXT_PUBLIC_API_BASE override, else window hostname:8000) so phones on LAN resolve to the backend. Expanded backend CORS to allow LAN origins in non-production while keeping production locked down. This fixes 'Failed to fetch random track' on mobile and surfaces the local playback control on all devices.",
  "tags": ["frontend", "backend", "player", "ui", "cors", "mobile", "lan", "bugfix"],
  "files_modified": [
    "frontend/src/lib/api.ts",
    "frontend/src/components/IntegratedPlayer.tsx",
    "backend-ts/src/app.ts"
  ]
}
```

```json
{
  "timestamp": "2025-08-30T18:18:09Z",
  "description": "fix(ui): standardize player controls to 50x50 and add plus/minus buttons under metadata",
  "details": "Updated IntegratedPlayer to render 50x50 Previous/Play/Next controls for consistent sizing and accessibility. Added large 50x50 plus/minus action buttons directly under the track title/artist section to adjust rating. Ensured existing Heroicons imports are used and handlers are wired to analytics rating functions.",
  "tags": ["frontend", "player", "ui", "feature", "bugfix"],
  "files_modified": [
    "frontend/src/components/IntegratedPlayer.tsx"
  ]
}
```

```json
{
  "timestamp": "2025-08-30T05:43:12Z",
  "description": "fix: prevent autoplay policy violations and correct Enable Audio button track id",
  "details": "Removed programmatic user-interaction flag setting from non-user actions (auto-advance/next) to comply with browser autoplay policies and reduce NotAllowedError noise. Updated the 'Enable Audio' button to invoke playback using the correct track identifier (id instead of youtubeId). Playback now starts cleanly after real user interaction and the help banner behaves accurately.",
  "tags": ["frontend", "player", "bugfix", "autoplay"],
  "files_modified": [
    "frontend/src/components/IntegratedPlayer.tsx"
  ]
}
```

```json
{
  "timestamp": "2025-08-30T05:23:53Z",
  "description": "fix: resolve browser autoplay policy violations and implement complete audio playback functionality",
  "details": "Fixed critical audio playback issues preventing music from playing on page load. Resolved NotAllowedError caused by attempting autoplay without user interaction by implementing proper user interaction detection with click/keydown/touchstart listeners. Added functional skip forward/backward buttons with proper track navigation and boundary checking. Implemented auto-advance functionality to automatically play next track when current track ends. Improved audio element synchronization with backend state and enhanced error handling with clear user feedback. Removed complex forced autoplay logic in favor of clean, browser-compliant audio management.",
  "tags": ["frontend", "player", "bugfix", "feature", "audio", "autoplay", "navigation"],
  "files_modified": [
    "frontend/src/components/IntegratedPlayer.tsx"
  ]
}
```

```json
{
  "timestamp": "2025-08-30T00:11:00Z",
  "description": "fix: resolve audio playback errors and implement timeline seeking functionality",
  "details": "Fixed critical audio playback issues in 9layer music player. Corrected backend audio endpoint URL from /audio/ to /playback/audio/ which was causing 'NotSupportedError: no supported sources' errors. Implemented proper timeline seeking by adding direct audio element currentTime manipulation and backend seek API calls. Enhanced user interaction tracking to comply with browser autoplay policies. Improved timeline UI by increasing height from 2px to 20px for better clickability. All core audio functionality now working including play/pause, seeking, and volume control.",
  "tags": ["frontend", "player", "bugfix", "feature"],
  "files_modified": [
    "frontend/src/components/IntegratedPlayer.tsx",
    "frontend/src/lib/api.ts"
  ]
}
```

```json
{
  "timestamp": "2025-08-28T23:41:50Z",
  "description": "perf: reduce backend request log noise and prevent duplicate frontend polling",
  "details": "Disabled Fastify per-request logging (disableRequestLogging) to eliminate high-volume info logs from /playback/state polling. Added a guard in IntegratedPlayer to ensure only one polling interval is created even under React StrictMode. This significantly reduces log spam while maintaining responsive playback state updates.",
  "tags": ["backend", "frontend", "player", "performance", "bugfix"],
  "files_modified": [
    "backend-ts/src/app.ts",
    "frontend/src/components/IntegratedPlayer.tsx"
  ]
}
```

```json
{
  "timestamp": "2025-08-27T21:57:00Z",
  "description": "fix: resolve frontend integration issues - track loading, search, and playback controls",
  "details": "Fixed critical frontend integration problems preventing proper music library display and functionality. Resolved API response format mismatch where backend returned {success, tracks, total} but frontend expected nested data structure. Updated frontend API client to transform responses correctly. Fixed database query ordering from createdAt desc to alphabetical by artist/album/title, revealing all 1,300+ tracks from 77 artists instead of just recent Aphex Twin entries. Added 300ms search debounce and verified search works for existing artists (92 results for 'run' including RUN DMC). Fixed play button functionality by updating playTrack API to fetch playback state after starting tracks. All core functionality now working: track loading, search, and playback controls.",
  "tags": ["frontend", "backend", "api", "search", "player", "database", "bugfix", "integration"],
  "files_modified": [
    "frontend/src/lib/api.ts",
    "frontend/src/components/IntegratedPlayer.tsx", 
    "backend-ts/src/routes/playback.routes.ts",
    "backend-ts/.env"
  ]
}
```

```json
{
  "timestamp": "2025-08-27T18:25:28Z",
  "description": "fix: resolve all TypeScript lint errors in backend-ts codebase",
  "details": "Comprehensively fixed all TypeScript compilation errors in the backend-ts project. Resolved import/export compatibility issues by properly configuring esModuleInterop and fixing module imports (path, fs, ws). Added Fastify type augmentation to enable prisma property access on FastifyInstance. Fixed Jest mock return type issues with proper TypeScript annotations for Promise<void> returns. Resolved WebSocket import patterns and Map iterator compatibility issues. Updated tsconfig.json to include test files in compilation scope. Added missing Artist and Album type definitions to api.types.ts. Backend is now fully type-safe and ready for testing phase.",
  "tags": ["backend", "typescript", "lint", "bugfix", "types", "jest", "websocket", "fastify"],
  "files_modified": [
    "backend-ts/tsconfig.json",
    "backend-ts/src/types/fastify.d.ts", 
    "backend-ts/src/types/api.types.ts",
    "backend-ts/src/utils/file-utils.ts",
    "backend-ts/src/utils/yt-dlp.ts",
    "backend-ts/src/services/download.service.ts",
    "backend-ts/src/services/websocket.service.ts",
    "backend-ts/src/routes/download.routes.ts",
    "backend-ts/src/routes/playback.routes.ts", 
    "backend-ts/src/routes/websocket.routes.ts",
    "backend-ts/tests/routes/websocket.routes.test.ts",
    "backend-ts/tests/test-app.ts",
    ".gitignore"
  ]
}
```

```json
{
  "timestamp": "2025-07-19T22:15:00Z",
  "description": "fix: Enhance WebSocket connection stability and recovery for page refresh scenarios",
  "details": "Implemented robust WebSocket connection recovery system to address page refresh disconnection issues. Added aggressive reconnection logic with heartbeat monitoring every 3 seconds when disconnected. Enhanced usePlayerSocket hook with mounting delays to ensure stable connections. Added comprehensive connection status indicators (Connected/Connecting/Disconnected) with visual feedback. Implemented multiple reconnection triggers: page load detection, tab visibility changes, network reconnection events, and periodic heartbeat checks. Improved error handling and timeout detection for hanging connections. Users can now refresh the page without losing WebSocket connectivity, ensuring uninterrupted music playback experience.",
  "tags": ["frontend", "websocket", "connection", "recovery", "stability", "bugfix", "ux"],
  "files_modified": [
    "frontend/src/components/Player.tsx",
    "frontend/src/hooks/usePlayerSocket.ts"
  ]
}
```

```json
{
  "timestamp": "2025-07-19T21:45:00Z",
  "description": "fix: Complete auto-play functionality with user interaction compliance",
  "details": "Resolved critical infinite re-render loop causing audio to restart every 0.18 seconds by separating time sync from audio sync useEffect hooks. Implemented browser auto-play policy compliance by adding user interaction detection - auto-play now works after user clicks anywhere on the page. Fixed WebSocket state override prevention to maintain playback state. Enhanced backend with browser-based audio serving, optimized API queries, and comprehensive WebSocket command processing. Track loads successfully with metadata and plays continuously in browser tab as intended.",
  "tags": ["frontend", "backend", "player", "websocket", "bugfix", "performance", "feature"],
  "files_modified": [
    "frontend/src/components/Player.tsx",
    "backend/app/services/playback_service.py", 
    "backend/app/routers/websocket_router.py",
    "backend/app/routers/download_router.py",
    "backend/main.py",
    "backend/.env"
  ]
}
```
