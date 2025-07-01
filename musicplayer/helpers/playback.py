"""Low-level playback helpers.

This module isolates all direct interaction with the external command
line player (``mpg123``).  Higher-level orchestration happens in the
controller layer.
"""
from __future__ import annotations

import os
import subprocess
import threading
import time
from pathlib import Path
from typing import Optional

from .config import PLAYER_CMD, MUSIC_DIR

__all__ = [
    "spawn_playback_process",
    "terminate_process",
    "calc_scalefactor",
]


def calc_scalefactor(volume_percentage: int) -> int:
    """Return mpg123 ``-f`` scalefactor for *volume_percentage* 0-100."""
    return int((max(0, min(volume_percentage, 100)) / 100.0) * 32768)


def _build_command(file_path: str, start_time: int, scalefactor: int) -> list[str]:
    return [
        PLAYER_CMD,
        "-k",
        str(int(start_time * 44_100)),  # skip <frames>; 44100 frames ≈ 1 s
        "-f",
        str(scalefactor),
        file_path,
    ]


def spawn_playback_process(
    file_path: str,
    start_time: int = 0,
    volume_pct: int = 50,
    *,
    stdout=None,
    stderr=subprocess.DEVNULL,
) -> subprocess.Popen:
    """Start mpg123 and return the Popen object."""
    scalefactor = calc_scalefactor(volume_pct)
    cmd = _build_command(file_path, start_time, scalefactor)
    return subprocess.Popen(cmd, stdout=stdout, stderr=stderr)


def terminate_process(proc: Optional[subprocess.Popen]):
    """Gracefully terminate *proc*, killing after timeout if needed."""
    if proc is None:
        return
    try:
        proc.terminate()
        proc.wait(timeout=2)
    except (subprocess.TimeoutExpired, ProcessLookupError):
        try:
            proc.kill()
        except Exception:
            pass
