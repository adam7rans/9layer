# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

9layer is a YouTube downloader and music player application with:
- **TypeScript Backend**: Fastify RESTful API with WebSocket support for real-time playback
- **Next.js Frontend**: Modern web UI with real-time player controls
- **PostgreSQL Database**: Stores track metadata, albums, and user preferences

## Essential Commands

### Backend Development
```bash
# Start the TypeScript backend server
cd backend && npm run dev

# Run backend tests
cd backend && npm test

# Check database connection
cd backend && npm run test:db
```

### Frontend Development
```bash
# Start the Next.js development server
cd frontend && npm run dev

# Build production frontend
cd frontend && npm run build

# Run frontend linting
cd frontend && npm run lint
```

### Testing
```bash
# Run backend tests
cd backend-ts && npm test

# Run frontend tests
cd frontend && npm test
```

## Architecture Overview

### Multi-Component System
- **Frontend** (`frontend/`): Next.js 15 + React 19 + TypeScript + Tailwind CSS
- **Backend** (`backend/`): Fastify + Prisma + PostgreSQL with WebSocket support

### Database Schema
- **Artists**: Store artist information
- **Albums**: YouTube playlists or albums with type enum (album/playlist)
- **Tracks**: Individual songs with metadata, file paths, and likeability scores
- **Relationships**: Albums contain tracks, tracks reference albums

### Key Technologies
- **Backend**: Fastify, Prisma, PostgreSQL, WebSocket, yt-dlp
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **Database**: PostgreSQL with Prisma ORM

## Development Patterns

### Backend Structure
- **Routes**: Organized by feature (download, playback, websocket)
- **Services**: Business logic separated from HTTP handlers
- **Models**: Prisma models with relationships
- **WebSocket**: Real-time communication for player state updates

### Frontend Structure
- **Components**: Reusable UI components (Player, SearchBox, Timeline, etc.)
- **Hooks**: Custom hooks for WebSocket management (`usePlayerSocket`)
- **Types**: TypeScript definitions for WebSocket messages and player state

### Database Configuration
- Uses PostgreSQL (requires DATABASE_URL in .env)
- Connection pooling via Prisma
- Migration support via Prisma migrate

## Important Files

### Configuration
- `.env`: Database connection and app configuration
- `backend/src/config/environment.ts`: Centralized configuration management
- `backend/prisma/schema.prisma`: Database schema definition

### Core Components
- `backend/src/app.ts`: Fastify application factory
- `backend/prisma/schema.prisma`: Database models (Artist, Album, Track)
- `frontend/src/components/IntegratedPlayer.tsx`: Main player component

### Entry Points
- `cd backend && npm run dev`: Start Fastify server
- `cd frontend && npm run dev`: Start Next.js development server

## Database Requirements

### PostgreSQL Setup
Must have PostgreSQL 14+ installed and running. Create database and user:
```sql
CREATE DATABASE music_player;
CREATE USER music_user WITH PASSWORD 'your_secure_password';
GRANT ALL PRIVILEGES ON DATABASE music_player TO music_user;
```

### Environment Variables
Required in `.env` file:
```
DATABASE_URL=postgresql://music_user:your_secure_password@localhost:5432/music_player
```

## Migration Notes

The project has been migrated from Python/FastAPI to TypeScript/Fastify. Key changes:
- Backend rewritten in TypeScript using Fastify framework
- Database access via Prisma ORM instead of SQLAlchemy
- Improved type safety and development experience
- Better performance with TypeScript compilation

## Common Development Workflows

### Adding New Features
1. Backend: Add routes in `backend/src/routes/`
2. Frontend: Create components in `frontend/src/components/`
3. Database: Update Prisma schema in `backend/prisma/schema.prisma`
4. Tests: Add tests in respective `tests/` directories

### Working with WebSocket
- Player state updates flow through WebSocket connections
- Backend sends real-time updates to frontend
- Custom hook `usePlayerSocket` manages connection state

### Database Operations
- Use Prisma ORM for database interactions
- Connection management via Prisma Client
- Relationship loading via Prisma includes

## Development Workflow

### Development Entry Process

When completing development work, follow this standardized wrap-up process:

1. **Create Development Log Entry**
   - Add timestamped JSON entry to `____docs/devlog.md`
   - Entry should be placed at the top of the file
   - Include timestamp, description, details, tags, and files modified

2. **Commit Changes**
   - Create git commit with descriptive message
   - Follow conventional commit format: `type: description`
   - Include all relevant files in the commit

3. **Push to GitHub**
   - Push changes to the remote repository
   - Ensure all changes are properly synchronized

### Development Log Entry Format

Add entries to `____docs/devlog.md` in this JSON format:

```json
{
  "timestamp": "ISO 8601 timestamp (YYYY-MM-DDTHH:MM:SSZ)",
  "description": "Brief description in commit message format (type: description)",
  "details": "Detailed explanation of changes, problems solved, and implementation notes",
  "tags": ["relevant", "tags", "for", "categorization"],
  "files_modified": ["array", "of", "modified", "files"]
}
```

## Session Wrap-up Workflow

At the end of each coding session, follow this standardized process to properly document and commit all work:

### 1. Create Detailed Commit Messages
Write comprehensive commit messages that clearly describe:
- **Problem**: What issue was being addressed
- **Solution**: How the issue was resolved
- **Files Modified**: List the key files that were changed
- **Impact**: What the fix accomplishes for users

Use conventional commit format:
```
fix: resolve shader compilation error in 9-Point Mesh Gradient

- Fixed extra closing parenthesis in rand_offset function
- Cleared build cache to ensure changes take effect
- Updated both main site and video generator shader files

Files modified:
- site/src/lib/video-renderer/background-effects/effects/gradients/NinePointMeshGradientShader.ts
- video-gen-and-proc/src/components/effects/ninePointMeshGradient/NinePointMeshGradientShader.ts

```

### 2. Update Development Log
Add a new entry to `____docs/dev_diary/devlog.md` at the top of the file 

Follow this format:
## Entries

```json
{
  "timestamp": "2025-07-15T18:40:00Z",
  "description": "fix: Resolve search functionality and populate database with music library",
  "details": "Set up Python environment with pyenv, populated PostgreSQL database with 2,935 tracks from music library, fixed frontend search API data transformation issue where album objects were not properly mapped to strings",
  "tags": ["backend", "frontend", "database", "search", "bugfix", "setup"],
  "files_modified": [
    "frontend/src/components/SearchBox.tsx", 
    "backend/app/database.py",
    "populate_database_simple.py"
  ]
}
```

---

## Development Entry Format

Each entry should be a JSON object with the following structure:

```json
{
  "timestamp": "ISO 8601 timestamp",
  "description": "Brief description in commit message format (type: description)",
  "details": "Detailed explanation of changes, problems solved, and implementation notes",
  "tags": ["relevant", "tags", "for", "categorization"],
  "files_modified": ["array", "of", "modified", "files"]
}
```

### Tags Guidelines
- **backend**: Backend/API changes
- **frontend**: Frontend/UI changes  
- **database**: Database schema or data changes
- **search**: Search functionality
- **player**: Music player functionality
- **websocket**: WebSocket/real-time features
- **bugfix**: Bug fixes
- **feature**: New features
- **setup**: Environment/configuration setup
- **refactor**: Code refactoring
- **performance**: Performance improvements
- **security**: Security-related changes


### 3. Commit and Push Changes
Execute the complete git workflow:
```bash
# Add all changes
git add .

# Create commit with detailed message
git commit -m "[detailed commit message]"

# Push to remote repository
git push origin main
```

### 4. Verification
Ensure all changes are properly committed by:
- Checking `git status` shows no uncommitted changes
- Verifying the commit appears in the remote repository
- Confirming the dev log entry is present in `_docs/dev_diary/devlog.md`

This workflow ensures comprehensive documentation of all development work and maintains a clear history of project evolution for future reference.