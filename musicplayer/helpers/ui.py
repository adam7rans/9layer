"""Terminal-UI helpers for the music player."""

from __future__ import annotations

from .config import CASSETTE_FRAMES

__all__ = [
    "get_progress_bar",
    "CASSETTE_FRAMES",
]


RESET = "\033[0m"
DIM_DASH = "\033[38;5;236m"


def get_progress_bar(progress: float, width: int = 60) -> str:
    """Return a textual progress bar for *progress* in the range ``0.0-1.0``."""
    progress = max(0.0, min(progress, 1.0))  # clamp
    filled = min(int(round(width * progress)), width)
    return f"{'=' * filled}{DIM_DASH}{'-' * (width - filled)}{RESET}"
