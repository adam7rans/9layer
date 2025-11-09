"""Coordinated Essentia analysis pipeline for 9layer music tracks.

The pipeline orchestrates fetching tracks that require Essentia analysis,
running feature extraction (optionally in parallel), and persisting results
back to PostgreSQL. It also records failures for later retries and exposes
convenience helpers used by the CLI layer or backend integrations.
"""

from __future__ import annotations

import logging
import os
from concurrent.futures import ProcessPoolExecutor, as_completed
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from .config import AnalysisSettings, get_settings
from .essentia_adapter import EssentiaConfig, EssentiaNotAvailableError
from .metadata import TrackAnalysisResult
from .storage import AnalysisStorage, TrackForAnalysis

LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class BatchSummary:
    """Tracks aggregate statistics for an analysis run."""

    requested: int = 0
    processed: int = 0
    saved: int = 0
    failed: int = 0
    skipped: int = 0
    errors: List[Tuple[str, str]] = field(default_factory=list)

    def to_dict(self) -> Dict[str, object]:
        """Return a JSON-friendly representation used by CLI/UI layers."""

        return {
            "requested": self.requested,
            "processed": self.processed,
            "saved": self.saved,
            "failed": self.failed,
            "skipped": self.skipped,
            "errors": self.errors,
        }


@dataclass(slots=True)
class PipelineConfig:
    """Configuration knobs controlling pipeline execution behaviours."""

    enable_embeddings: bool = True


# Worker-level globals allow Essentia to be initialised once per process.
_WORKER_ADAPTER = None  # type: ignore[var-annotated]


def _initialise_worker(config: PipelineConfig, model_dir: Optional[str]) -> None:
    """Initialise the global Essentia adapter inside a worker process."""

    global _WORKER_ADAPTER
    if _WORKER_ADAPTER is not None:
        return

    from .essentia_adapter import EssentiaAdapter  # Imported lazily for worker fork

    adapter_config = EssentiaConfig(
        model_dir=Path(model_dir) if model_dir else None,
        enable_embeddings=config.enable_embeddings,
    )
    _WORKER_ADAPTER = EssentiaAdapter(adapter_config)


def _worker_analyse(payload: Tuple[str, str, str, PipelineConfig, Optional[str]]) -> Dict[str, object]:
    """Perform Essentia analysis for a single track in a separate process."""

    track_id, file_path, analysis_version, pipeline_config, model_dir = payload

    # Lazily instantiate Essentia for this worker if not already done.
    _initialise_worker(pipeline_config, model_dir)

    from .metadata import TrackAnalysisResult  # Local import for multiprocessing safety

    file_path_obj = Path(file_path)
    if not file_path_obj.exists():
        raise FileNotFoundError(f"Audio file not found: {file_path}")

    result = _WORKER_ADAPTER.analyze_file(track_id, file_path_obj, analysis_version)  # type: ignore[operator]
    return result.to_storage_payload()


class AnalysisPipeline:
    """High-level orchestration for Essentia-based audio analysis."""

    def __init__(self, settings: Optional[AnalysisSettings] = None, config: Optional[PipelineConfig] = None) -> None:
        self.settings = settings or get_settings()
        self.config = config or PipelineConfig()
        self._storage = AnalysisStorage(self.settings.database_url)
        self._pool: Optional[ProcessPoolExecutor] = None

    def __enter__(self) -> "AnalysisPipeline":  # pragma: no cover - convenience wrapper
        return self

    def __exit__(self, exc_type, exc, tb) -> None:  # pragma: no cover - convenience wrapper
        self.close()

    def close(self) -> None:
        """Release database connections and worker resources."""

        self._storage.close()
        if self._pool:
            self._pool.shutdown(wait=True)
            self._pool = None

    def analyze_pending(self, limit: Optional[int] = None) -> BatchSummary:
        """Analyze tracks missing metadata up to the provided limit."""

        max_items = limit or self.settings.batch_size
        tracks = self._storage.fetch_tracks_for_analysis(
            required_version=self.settings.analysis_version,
            limit=max_items,
            force_reanalyze=self.settings.force_reanalyze,
        )
        return self._process_tracks(tracks)

    def analyze_specific_tracks(self, track_ids: Iterable[str]) -> BatchSummary:
        """Analyze an explicit list of track identifiers."""

        items: List[TrackForAnalysis] = []
        for track_id in track_ids:
            path = self._storage.get_track_file_path(track_id)
            if not path:
                LOGGER.warning("Skipping track without file path", extra={"track_id": track_id})
                continue
            items.append(TrackForAnalysis(track_id=track_id, file_path=path))
        return self._process_tracks(items)

    def retry_failures(self, limit: Optional[int] = None) -> BatchSummary:
        """Attempt to re-analyze tracks that previously failed."""

        failed = self._storage.list_failed_tracks(limit or self.settings.batch_size)
        return self._process_tracks(failed)

    def _process_tracks(self, tracks: List[TrackForAnalysis]) -> BatchSummary:
        """Run Essentia analysis for the provided track list."""

        summary = BatchSummary(requested=len(tracks))
        if not tracks:
            LOGGER.info("No tracks require analysis")
            return summary

        cpu_count = min(self.settings.max_workers, os.cpu_count() or 1)
        if cpu_count <= 1:
            for track in tracks:
                self._analyze_single(track, summary)
            return summary

        payloads = [
            (
                track.track_id,
                track.file_path,
                self.settings.analysis_version,
                self.config,
                self.settings.model_dir,
            )
            for track in tracks
        ]

        self._pool = ProcessPoolExecutor(max_workers=cpu_count)
        try:
            future_map = {
                self._pool.submit(_worker_analyse, payload): track
                for payload, track in zip(payloads, tracks)
            }
            for future in as_completed(future_map):
                track = future_map[future]
                try:
                    storage_payload = future.result()
                except FileNotFoundError as exc:
                    summary.skipped += 1
                    summary.errors.append((track.track_id, str(exc)))
                    LOGGER.warning("Skipping missing file", extra={"track_id": track.track_id, "error": str(exc)})
                    continue
                except Exception as exc:  # pragma: no cover - defensive guard
                    summary.failed += 1
                    summary.errors.append((track.track_id, str(exc)))
                    LOGGER.exception("Essentia analysis failed", extra={"track_id": track.track_id})
                    self._storage.record_failure(track.track_id, track.file_path, str(exc))
                    continue

                summary.processed += 1
                self._store_payload(storage_payload)
                summary.saved += 1
        finally:
            self._pool.shutdown(wait=True)
            self._pool = None

        return summary

    def _analyze_single(self, track: TrackForAnalysis, summary: BatchSummary) -> None:
        """Analyze a single track synchronously."""

        file_path_obj = Path(track.file_path)
        if not file_path_obj.exists():
            summary.skipped += 1
            summary.errors.append((track.track_id, "File not found"))
            LOGGER.warning("Skipping track without file", extra={"track_id": track.track_id})
            return

        try:
            from .essentia_adapter import EssentiaAdapter

            adapter = EssentiaAdapter(
                EssentiaConfig(
                    model_dir=Path(self.settings.model_dir) if self.settings.model_dir else None,
                    enable_embeddings=self.config.enable_embeddings,
                )
            )
            result = adapter.analyze_file(track.track_id, file_path_obj, self.settings.analysis_version)
        except EssentiaNotAvailableError as exc:
            summary.failed += 1
            summary.errors.append((track.track_id, str(exc)))
            LOGGER.error("Essentia not available", exc_info=exc)
            self._storage.record_failure(track.track_id, track.file_path, str(exc))
            return
        except FileNotFoundError:
            summary.skipped += 1
            summary.errors.append((track.track_id, "File not found"))
            LOGGER.warning("File missing during analysis", extra={"track_id": track.track_id})
            return
        except Exception as exc:  # pragma: no cover - defensive guard
            summary.failed += 1
            summary.errors.append((track.track_id, str(exc)))
            LOGGER.exception("Unexpected Essentia failure", extra={"track_id": track.track_id})
            self._storage.record_failure(track.track_id, track.file_path, str(exc))
            return

        storage_payload = result.to_storage_payload()
        summary.processed += 1
        self._store_payload(storage_payload)
        summary.saved += 1

    def _store_payload(self, storage_payload: Dict[str, object]) -> None:
        """Persist analysis results and mark any previous failures resolved."""

        result = TrackAnalysisResult.from_storage_payload(storage_payload)
        self._storage.save_analysis(result)
        self._storage.resolve_failure(result.track_id)

