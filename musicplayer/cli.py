"""Command-line entry point for the music player."""
from __future__ import annotations

import sys
import termios
import tty

from . import MusicPlayer


def _set_raw(fd):
    """Put *fd* in raw mode, returning old termios settings or None."""
    if not sys.stdin.isatty():
        return None
    try:
        old = termios.tcgetattr(fd)
        tty.setraw(fd)
        return old
    except termios.error:
        return None


def _restore(fd, old):
    if old and sys.stdin.isatty():
        termios.tcsetattr(fd, termios.TCSADRAIN, old)


def main():  # noqa: D401 – simple entry
    """Run the interactive music player."""
    fd = sys.stdin.fileno()
    old_settings = _set_raw(fd)

    player = MusicPlayer()
    try:
        player.run()
    except KeyboardInterrupt:
        player.command_queue.put("stop")
    finally:
        _restore(fd, old_settings)
        sys.stdout.write("\033[?25h")  # show cursor
        sys.stdout.flush()


if __name__ == "__main__":  # pragma: no cover
    main()
