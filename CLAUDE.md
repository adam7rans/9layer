# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

9layer is a YouTube downloader and music player application with:
- **Python CLI**: Terminal-based music player with keyboard controls
- **FastAPI Backend**: RESTful API with WebSocket support for real-time playback
- **Next.js Frontend**: Modern web UI with real-time player controls
- **PostgreSQL Database**: Stores track metadata, albums, and user preferences

## Essential Commands

### Backend Development
```bash
# Start the FastAPI backend server
cd backend && python main.py

# Run backend tests
cd backend && pytest

# Check database connection
cd backend && python test_db_connection.py

# Run database migrations (if needed)
cd backend && alembic upgrade head
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

### CLI Music Player
```bash
# Start the terminal music player
python 9layer.py

# Download YouTube content
python downloader.py "https://youtube.com/watch?v=VIDEO_ID" --audio-only
```

### Testing
```bash
# Run all Python tests
pytest

# Run backend tests specifically
cd backend && pytest --cov=app --cov-report=term-missing
```

## Architecture Overview

### Multi-Component System
- **Frontend** (`frontend/`): Next.js 15 + React 19 + TypeScript + Tailwind CSS
- **Backend** (`backend/`): FastAPI + SQLAlchemy + PostgreSQL with WebSocket support
- **CLI Player** (`musicplayer/`): Terminal-based player with keyboard controls
- **Downloader** (`downloader.py`): YouTube content downloader using yt-dlp

### Database Schema
- **Artists**: Store artist information
- **Albums**: YouTube playlists or albums with type enum (album/playlist)
- **Tracks**: Individual songs with metadata, file paths, and likeability scores
- **Relationships**: Albums contain tracks, tracks reference albums

### Key Technologies
- **Backend**: FastAPI, SQLAlchemy, PostgreSQL, WebSocket, yt-dlp
- **Frontend**: Next.js 15, React 19, TypeScript, Tailwind CSS
- **CLI**: Python with termios for raw terminal input
- **Database**: PostgreSQL with SQLAlchemy ORM (migrated from SQLite)

## Development Patterns

### Backend Structure
- **Routers**: Organized by feature (download, playback, websocket)
- **Services**: Business logic separated from HTTP handlers
- **Models**: SQLAlchemy models with relationships
- **WebSocket**: Real-time communication for player state updates

### Frontend Structure
- **Components**: Reusable UI components (Player, SearchBox, Timeline, etc.)
- **Hooks**: Custom hooks for WebSocket management (`usePlayerSocket`)
- **Types**: TypeScript definitions for WebSocket messages and player state

### Database Configuration
- Uses PostgreSQL (requires DATABASE_URL in .env)
- Connection pooling via SQLAlchemy
- Migration support via Alembic (when needed)

## Important Files

### Configuration
- `.env`: Database connection and app configuration
- `backend/app/config.py`: Centralized configuration management
- `backend/app/database.py`: Database connection setup

### Core Components
- `backend/main.py`: FastAPI application factory
- `backend/app/models.py`: Database models (Artist, Album, Track)
- `frontend/src/components/Player.tsx`: Main player component
- `musicplayer/controller.py`: CLI player controller

### Entry Points
- `python 9layer.py`: CLI music player (shim to musicplayer.cli)
- `python downloader.py`: YouTube content downloader
- `cd backend && python main.py`: Start FastAPI server
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

The project was migrated from SQLite to PostgreSQL. Key changes:
- Database connection via SQLAlchemy instead of direct SQLite
- Improved concurrent access support
- Better performance for complex queries
- Backup SQLite databases are in `old_sqlite_backups/`

## Common Development Workflows

### Adding New Features
1. Backend: Add routes in `backend/app/routers/`
2. Frontend: Create components in `frontend/src/components/`
3. Database: Update models in `backend/app/models.py`
4. Tests: Add tests in respective `tests/` directories

### Working with WebSocket
- Player state updates flow through WebSocket connections
- Backend sends real-time updates to frontend
- Custom hook `usePlayerSocket` manages connection state

### Database Operations
- Use SQLAlchemy ORM for database interactions
- Session management via dependency injection
- Relationship loading for complex queries

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

### Wrap-up Flow Commands

```bash
# 1. Create devlog entry (manual - edit ____docs/devlog.md)

# 2. Commit changes
git add .
git commit -m "type: description of changes"

# 3. Push to GitHub
git push origin main
```

### Development Tags

Use these tags for categorization:
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