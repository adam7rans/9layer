import os
from dotenv import load_dotenv
from pathlib import Path

# Load .env file from the project root directory
dotenv_path = Path(__file__).resolve().parent.parent.parent / '.env'
load_dotenv(dotenv_path)

# Default music directory relative to the project root
DEFAULT_MUSIC_DIR = Path(__file__).resolve().parent.parent.parent / "downloaded_music"
MUSIC_DOWNLOAD_DIR = Path(os.getenv("MUSIC_DOWNLOAD_DIR", DEFAULT_MUSIC_DIR))

# Ensure the download directory exists
MUSIC_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# Logging configuration
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

# Server configuration
PORT = int(os.getenv("PORT", 8000))
HOST = os.getenv("HOST", "0.0.0.0")
STATIC_DIR = os.getenv("STATIC_DIR", "../frontend/static")

# You can add other configurations here, e.g., yt-dlp format options
AUDIO_FORMAT = "bestaudio/best"
AUDIO_POSTPROCESSOR_OPTS = {
    'key': 'FFmpegExtractAudio',
    'preferredcodec': 'mp3',
    'preferredquality': '192',
}
OUTPUT_TEMPLATE = '%(artist)s/%(album)s/%(title)s.%(ext)s'