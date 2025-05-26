import os
from dotenv import load_dotenv
from pathlib import Path

# Load .env file from the `music_backend` directory
dotenv_path = Path(__file__).resolve().parent.parent / '.env'
load_dotenv(dotenv_path)

# Default music directory relative to the music_backend directory
DEFAULT_MUSIC_DIR = Path(__file__).resolve().parent.parent / "downloaded_music"
MUSIC_DOWNLOAD_DIR = Path(os.getenv("MUSIC_DOWNLOAD_DIR", DEFAULT_MUSIC_DIR))

# Ensure the download directory exists
MUSIC_DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

# You can add other configurations here, e.g., yt-dlp format options
AUDIO_FORMAT = "bestaudio/best"
AUDIO_POSTPROCESSOR_OPTS = {
    'key': 'FFmpegExtractAudio',
    'preferredcodec': 'mp3',
    'preferredquality': '192',
}
OUTPUT_TEMPLATE = '%(artist)s/%(album)s/%(title)s.%(ext)s'
