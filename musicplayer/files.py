"""File and metadata helper utilities for the music player."""

from __future__ import annotations

import os
import subprocess
from pathlib import Path
from typing import List

from .config import MUSIC_DIR, SUPPORTED_FORMATS

__all__ = [
    "find_music_files",
    "get_song_duration",
    "format_time",
]


def find_music_files() -> List[str]:
    """Recursively search ``MUSIC_DIR`` for audio files.

    Returns
    -------
    list[str]
        Absolute paths to all supported audio files that were found.
    """
    files: list[str] = []
    music_path = Path(MUSIC_DIR)
    if not music_path.is_dir():
        print(f"ERROR: Music directory does not exist: {MUSIC_DIR}")
        return files

    for root, _, filenames in os.walk(music_path):
        for filename in filenames:
            if filename.lower().endswith(SUPPORTED_FORMATS):
                files.append(str(Path(root) / filename))
    return files


def get_song_duration(file_path: str) -> int:
    """Return the duration of *file_path* in seconds using ``ffprobe``.

    If ``ffprobe`` fails, 0 is returned.
    """
    try:
        cmd = (
            "ffprobe -v error -show_entries format=duration -of "
            "default=noprint_wrappers=1:nokey=1 "
            f"'{file_path}'"
        )
        duration_str = subprocess.check_output(
            cmd, shell=True, stderr=subprocess.DEVNULL, text=True
        ).strip()
        return int(float(duration_str))
    except Exception:
        return 0


def format_time(seconds: int) -> str:
    """Format *seconds* as ``M:SS`` (e.g., 215 → "3:35")."""
    minutes, secs = divmod(int(seconds), 60)
    return f"{minutes}:{secs:02d}"
