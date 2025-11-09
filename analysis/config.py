"""Configuration helpers for the 9layer Essentia analysis toolkit.

This module centralizes runtime settings for the audio analysis pipeline. It
reads environment variables, applies sensible defaults, and exposes a
cacheable accessor so downstream modules can retrieve configuration without
re-reading the operating system environment repeatedly.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from functools import lru_cache
from typing import Dict, Optional


@dataclass(frozen=True)
class AnalysisSettings:
    """Container for configuration values used by the analysis pipeline."""

    database_url: str
    music_root: str
    python_bin: str
    cli_path: str
    analysis_version: str
    batch_size: int
    max_workers: int
    force_reanalyze: bool
    cache_dir: str
    model_dir: Optional[str]

    def to_dict(self) -> Dict[str, Optional[str]]:
        """Serialize settings into a dictionary for logging or debugging."""

        return {
            "database_url": self.database_url,
            "music_root": self.music_root,
            "python_bin": self.python_bin,
            "cli_path": self.cli_path,
            "analysis_version": self.analysis_version,
            "batch_size": str(self.batch_size),
            "max_workers": str(self.max_workers),
            "force_reanalyze": str(self.force_reanalyze),
            "cache_dir": self.cache_dir,
            "model_dir": self.model_dir,
        }


def _coerce_bool(value: Optional[str], default: bool) -> bool:
    """Interpret environment strings as booleans."""

    if value is None:
        return default
    lowered = value.strip().lower()
    if lowered in {"1", "true", "yes", "y", "on"}:
        return True
    if lowered in {"0", "false", "no", "n", "off"}:
        return False
    return default


@lru_cache(maxsize=1)
def get_settings() -> AnalysisSettings:
    """Return a cached `AnalysisSettings` instance built from the environment."""

    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise RuntimeError(
            "DATABASE_URL must be defined for the analysis pipeline to connect to Postgres."
        )

    music_root = os.getenv("MUSIC_ROOT", os.path.join(os.getcwd(), "music"))
    python_bin = os.getenv("ANALYSIS_PYTHON_BIN", "python3")
    cli_path = os.getenv("ANALYSIS_CLI_PATH", os.path.join(os.getcwd(), "analysis", "cli.py"))
    analysis_version = os.getenv("ANALYSIS_VERSION", "essentia-1")

    batch_size = int(os.getenv("ANALYSIS_BATCH_SIZE", "16"))
    max_workers = int(os.getenv("ANALYSIS_MAX_WORKERS", "4"))
    force_reanalyze = _coerce_bool(os.getenv("ANALYSIS_FORCE_REANALYZE"), False)
    cache_dir = os.getenv("ANALYSIS_CACHE_DIR", os.path.join(os.getcwd(), "analysis-cache"))
    model_dir = os.getenv("ANALYSIS_MODEL_DIR")

    return AnalysisSettings(
        database_url=database_url,
        music_root=music_root,
        python_bin=python_bin,
        cli_path=cli_path,
        analysis_version=analysis_version,
        batch_size=batch_size,
        max_workers=max_workers,
        force_reanalyze=force_reanalyze,
        cache_dir=cache_dir,
        model_dir=model_dir,
    )
