"""System-level helpers (macOS sleep prevention, idle-time monitoring)."""
from __future__ import annotations

import ctypes
import ctypes.util
import os
import subprocess
import sys
import threading
import time
from typing import Optional, Callable

# Try to import Objective-C bridge for App Nap disabling (optional)
try:
    import objc  # type: ignore
    from Foundation import NSBundle  # type: ignore

    MACOS_AVAILABLE = True
except ImportError:  # pragma: no cover
    MACOS_AVAILABLE = False

__all__ = [
    "setup_sleep_prevention",
    "cleanup_sleep_prevention",
    "start_idle_monitor",
    "get_idle_time",
]


# ---------------------------------------------------------------------------
# Sleep-prevention helpers
# ---------------------------------------------------------------------------

def _kill_existing_caffeinate():
    try:
        subprocess.run(["pkill", "-f", "caffeinate"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except Exception:
        pass


def setup_sleep_prevention() -> Optional[subprocess.Popen]:
    """On macOS, launch ``caffeinate -i`` and return the process object."""
    if sys.platform != "darwin":
        return None

    try:
        # Disable App Nap for GUI bundles
        if MACOS_AVAILABLE:
            bundle = NSBundle.mainBundle()
            if bundle:
                info = bundle.localizedInfoDictionary() or bundle.infoDictionary()
                if info is not None:
                    info["NSAppSleepDisabled"] = True

        _kill_existing_caffeinate()
        proc = subprocess.Popen(["caffeinate", "-i"], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        print("Sleep prevention enabled – system won’t idle-sleep (display may).")
        return proc
    except Exception as exc:  # pragma: no cover – debug helper
        print(f"Warning: Could not activate sleep prevention: {exc}")
        return None


def cleanup_sleep_prevention(proc: Optional[subprocess.Popen]):
    """Terminate *proc* (if provided) and any stray caffeinate processes."""
    if sys.platform != "darwin":
        return

    if proc is not None:
        try:
            proc.terminate()
            proc.wait(timeout=2)
        except (subprocess.TimeoutExpired, ProcessLookupError):
            try:
                proc.kill()
            except Exception:
                pass

    _kill_existing_caffeinate()


# ---------------------------------------------------------------------------
# Idle monitor helpers
# ---------------------------------------------------------------------------

def get_idle_time(fallback_last_activity: float) -> float:
    """Return system idle time in seconds (macOS) or fallback difference."""
    if sys.platform == "darwin":
        try:
            ctypes.cdll.LoadLibrary(ctypes.util.find_library("CoreGraphics"))
            event_any = ctypes.c_uint64.in_dll(ctypes.cdll.CoreGraphics, "kCGAnyInputEventType")
            idle = ctypes.c_double.in_dll(ctypes.cdll.CoreGraphics, "CGEventSourceSecondsSinceLastEventType")(  # type: ignore
                ctypes.c_uint32(0), ctypes.c_uint32(event_any.value)
            )
            return float(idle)
        except Exception:
            pass  # fall through to fallback
    return time.time() - fallback_last_activity


def start_idle_monitor(
    get_running: Callable[[], bool],
    inactivity_timeout: int,
    on_timeout: Callable[[], None],
    get_last_activity: Callable[[], float],
):
    """Spawn a daemon thread that calls *on_timeout* after *inactivity_timeout* secs."""

    def _loop():
        while get_running():
            idle_seconds = get_idle_time(get_last_activity())
            if idle_seconds > inactivity_timeout:
                print("\nInactivity timeout reached – shutting down…")
                on_timeout()
                os._exit(0)
            time.sleep(10)

    threading.Thread(target=_loop, daemon=True).start()
