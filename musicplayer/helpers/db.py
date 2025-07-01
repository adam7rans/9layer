"""Database helpers used by the music player.

This module wraps SQLAlchemy session creation and the *likeability*
update helper so that the rest of the codebase stays agnostic to DB
details.  It is largely extracted from the original logic in
``9layer.py``.
"""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

__all__ = [
    "init_session_factory",
    "update_likeability",
]


def _find_dotenv() -> Optional[str]:
    """Return the path to the closest ``.env`` or ``None`` if not found."""
    # Look in project root then current dir.
    script_dir = Path(__file__).resolve().parent.parent  # …/9layer
    project_root = script_dir.parent
    for candidate in (
        project_root / ".env",
        script_dir / ".env",
    ):
        if candidate.is_file():
            return str(candidate)
    return None


def init_session_factory():
    """Initialise SQLAlchemy and return a ``sessionmaker``.

    If the DB cannot be initialised, ``None`` is returned so callers can
    gracefully disable likeability tracking.
    """
    print("\n=== Initialising database session ===")

    dotenv_path = _find_dotenv()
    if not dotenv_path:
        print("  ❌  .env file not found – likeability tracking disabled")
        return None

    print(f"  Using .env at {dotenv_path}")
    load_dotenv(dotenv_path)

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("  ❌  DATABASE_URL not set – likeability tracking disabled")
        return None

    try:
        engine = create_engine(db_url, pool_pre_ping=True, future=True)
        Session = sessionmaker(bind=engine)
        # NB: engine is kept by Session.
        print("  ✅  Database ready for likeability tracking")
        return Session
    except Exception as exc:  # pragma: no cover – debug helper
        print(f"  ❌  Could not connect to database: {exc}")
        return None


# --- Likeability helper ----------------------------------------------------


def update_likeability(session_factory, track_id: int, change: int) -> bool:
    """Update *track_id*'s likeability by *change* (±1).

    Returns ``True`` if the operation succeeded (or was a no-op because
    value already at limits).  A failure to connect / update returns
    ``False``.
    """
    if session_factory is None or track_id is None:
        return False

    # Import lazily to avoid circular dependency on large ORM package.
    try:
        from backend.app.models import Track  # type: ignore
    except ImportError as exc:
        print(f"  Could not import Track model: {exc}")
        return False

    try:
        session = session_factory()
    except Exception as exc:
        print(f"  Could not create DB session: {exc}")
        return False

    try:
        track = session.query(Track).filter_by(id=track_id).first()
        if not track:
            print(f"  Track {track_id} not found in DB")
            return False

        current = track.likeability or 0
        new_value = max(-1, min(1, current + change))
        if new_value != current:
            track.likeability = new_value
            session.commit()
            print(f"  Likeability updated → {new_value}")
        return True
    except Exception as exc:
        session.rollback()
        print(f"  DB error while updating likeability: {exc}")
        return False
    finally:
        session.close()
