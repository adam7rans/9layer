"""Central configuration and constants used by the music player package."""

from pathlib import Path
import os

# Cassette animation frames (simplified)
CASSETTE_FRAMES = [
    "╭───────╮\n│▒▒▒▒▒▒ │\n╰───────╯",
    "╭───────╮\n│▒ ▒▒▒▒ │\n╰───────╯",
    "╭───────╮\n│▒▒ ▒▒▒ │\n╰───────╯",
    "╭───────╮\n│▒▒▒ ▒▒ │\n╰───────╯",
    "╭───────╮\n│▒▒▒▒ ▒ │\n╰───────╯",
    "╭───────╮\n│▒▒▒▒▒  │\n╰───────╯",
]

# Supported audio formats
SUPPORTED_FORMATS = (".mp3", ".wav", ".ogg", ".flac", ".m4a", ".aac")

# Directories
SCRIPT_DIR = Path(os.path.dirname(os.path.abspath(__file__))).parent  # /.../9layer
MUSIC_DIR = str(SCRIPT_DIR / "music")

# External player command
PLAYER_CMD = "mpg123"
