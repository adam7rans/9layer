# 9layer - Advanced YouTube Downloader & Music Player

## Features
- **Smart Downloading**: Videos, audio-only, or entire playlists
- **Music Player**: Beautiful terminal interface with playback controls
- **Audio Management**: Automatic organization in `/music` directory
- **System Integration**: Volume controls and macOS/Windows support
- **PostgreSQL Backend**: Scalable database for music metadata

## Installation

### Prerequisites
- Python 3.8+
- PostgreSQL 14+
- ffmpeg (for audio conversion)

### System Dependencies
```bash
# macOS
brew install postgresql@14 ffmpeg

# Ubuntu/Debian
sudo apt update
sudo apt install postgresql-14 ffmpeg
```

### Python Dependencies
```bash
pip install -r requirements.txt
```

### Database Setup
1. Create PostgreSQL database and user:
   ```sql
   CREATE DATABASE music_player;
   CREATE USER music_user WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE music_player TO music_user;
   ```

2. Configure environment variables in `.env`:
   ```
   DATABASE_URL=postgresql://music_user:your_secure_password@localhost:5432/music_player
   ```

## 9layer Downloader Usage

### Basic Commands
```bash
# Download video (best quality)
python downloader.py "https://youtube.com/watch?v=VIDEO_ID"

# Download audio only (high quality MP3)
python downloader.py "URL" --audio-only

# Custom download location
python downloader.py "URL" --path "~/Music/MyAlbum"
```

### Advanced Features
```bash
# Download entire playlist (video or audio)
python downloader.py "PLAYLIST_URL" --audio-only

# Download specific playlist items (e.g., tracks 5-10)
python downloader.py "PLAYLIST_URL" --playlist-items 5-10

# Custom audio quality (192kbps)
python downloader.py "URL" --audio-only --quality 192
```

## 9layer Music Player
```bash
python 9layer.py
```

### Interactive Controls
| Key | Action |
|-----|--------|
| `N` | Next track |
| `P` | Previous track |
| `R` | Toggle random mode |
| `=` | Volume up |
| `-` | Volume down |
| `M` | Mute toggle |
| `Q` | Quit player |

## Project Structure
```
9layer/
├── downloader.py      # Main download script
├── 9layer.py          # Interactive music player
├── db_models.py       # Database models
├── music/             # Downloaded audio storage
├── migrations/        # Database migrations
├── .env.example      # Example environment config
├── requirements.txt   # Python dependencies
└── README.md         # This documentation
```

## Development

### Running Tests
```bash
# Run all tests
pytest

# Run with coverage report
pytest --cov=app --cov-report=term-missing
```

### Database Migrations
Database migrations are handled automatically on startup. For manual migrations:

```bash
# Show current migration status
alembic current

# Create a new migration
alembic revision --autogenerate -m "description of changes"

# Apply migrations
alembic upgrade head
```

## Requirements
- Python 3.8+
- PostgreSQL 14+
- yt-dlp (YouTube downloader)
- ffmpeg (for audio conversion)
- See `requirements.txt` for Python dependencies

## Migration to PostgreSQL

### Breaking Changes

As of June 2024, the application has been migrated from SQLite to PostgreSQL. This change brings:

1. **Required PostgreSQL** - SQLite is no longer supported
2. **New Setup Required** - All users must set up PostgreSQL and configure the connection
3. **Data Migration** - Existing SQLite data needs to be migrated to PostgreSQL

### Migration Steps

1. **Backup Existing Data**
   ```bash
   # Backup your existing SQLite database
   cp music_metadata.db music_metadata.backup.db
   ```

2. **Install PostgreSQL**
   ```bash
   # macOS
   brew install postgresql@14
   
   # Ubuntu/Debian
   sudo apt update
   sudo apt install postgresql-14
   ```

3. **Set Up Database**
   ```sql
   CREATE DATABASE music_player;
   CREATE USER music_user WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE music_player TO music_user;
   ```

4. **Update Configuration**
   Create or update `.env` with:
   ```
   DATABASE_URL=postgresql://music_user:your_secure_password@localhost:5432/music_player
   ```

5. **Run Migrations**
   ```bash
   # The application will automatically create tables on first run
   python downloader.py --help
   ```

## License
Open source - [MIT License](LICENSE)
