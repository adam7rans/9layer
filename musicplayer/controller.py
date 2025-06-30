"""Controller layer – orchestrates playback using helper modules.

For now this wraps the existing legacy `MusicPlayer` implementation so
that the package structure is in place while we incrementally migrate
internals.  Downstream callers should import ``musicplayer.MusicPlayer``
which resolves (lazily) to this class.
"""
from __future__ import annotations

from pathlib import Path
import importlib

# ---------------------------------------------------------------------------
# Temporary shim that re-exports the legacy implementation until full
# migration is complete.  This allows us to keep refactoring in small
# steps without breaking runtime usage.
# ---------------------------------------------------------------------------




class MusicPlayer:
    """Independent controller coordinating helper modules.

    This is a *minimal* placeholder implementation that eliminates the
    old circular import.  It will be expanded with full playback and UI
    logic in subsequent steps.
    """

    def __init__(self, music_dir: str | None = None):
        from .files import find_music_files
        from .config import MUSIC_DIR

        self.music_dir = Path(music_dir or MUSIC_DIR).expanduser()
        self.music_files = find_music_files()
        self.command_queue: "queue.Queue[str]" = importlib.import_module("queue").Queue()
        self.current_index = 0

    # ------------------------------------------------------------------
    # Public API expected by cli.py
    # ------------------------------------------------------------------
    def run(self):  # noqa: D401 simple public method
        """Run the (placeholder) player loop."""
        import sys, time

        if not self.music_files:
            sys.stdout.write("No music files found in %s\n" % self.music_dir)
            sys.stdout.flush()
            return

        sys.stdout.write(
            "MusicPlayer placeholder – %d files indexed. Quit with Ctrl-C.\n"
            % len(self.music_files)
        )
        sys.stdout.flush()
        try:
            while True:
                time.sleep(1)
                if not self.command_queue.empty():
                    cmd = self.command_queue.get()
                    if cmd == "stop":
                        break
        except KeyboardInterrupt:
            pass

    # For compatibility with cli’s KeyboardInterrupt handler
    def stop(self):
        self.command_queue.put("stop")
