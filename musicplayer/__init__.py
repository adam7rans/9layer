# musicplayer package initialization

from importlib import import_module as _imp

__all__ = [
    "config",
    "files",
    "ui",
    "db",
    "playback",
    "system",
    "controller",
    "MusicPlayer",
]

# Lazy import MusicPlayer so that controller.py isn't imported unless needed

def __getattr__(name):
    if name == "MusicPlayer":
        return _imp("musicplayer.controller").MusicPlayer
    if name in {
        "config",
        "controller",
    }:
        return _imp(f"musicplayer.{name}")
    if name in {
        "files",
        "ui",
        "db",
        "playback",
        "system",
    }:
        return _imp(f"musicplayer.helpers.{name}")
    raise AttributeError(name)
