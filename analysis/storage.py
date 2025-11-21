"""Database persistence helpers for 9layer's audio analysis pipeline.

The storage module encapsulates all direct interactions with PostgreSQL so the
rest of the analysis system can operate on high-level abstractions. The helper
class manages connections, retrieves track metadata needed for Essentia, and
handles upserting analysis results or recording failures for future retries.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Dict, List, Optional, Sequence, Tuple
from uuid import uuid4

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Json

from .metadata import TrackAnalysisResult

LOGGER = logging.getLogger(__name__)


@dataclass(slots=True)
class TrackForAnalysis:
    """Represents a track that requires Essentia analysis."""

    track_id: str
    file_path: str


class AnalysisStorage:
    """Facade around PostgreSQL queries related to audio analysis metadata."""

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn
        # Autocommit helps ensure each write is flushed without explicit commit calls.
        self._conn = psycopg.connect(self._dsn, autocommit=True)
        LOGGER.debug("Connected to Postgres for analysis tasks", extra={"dsn": self._dsn})

    def close(self) -> None:
        """Close the underlying database connection."""

        try:
            self._conn.close()
            LOGGER.debug("Closed Postgres connection for analysis storage")
        except Exception:  # pragma: no cover - defensive cleanup
            LOGGER.exception("Failed to close analysis storage connection cleanly")

    def fetch_tracks_for_analysis(
        self,
        required_version: str,
        limit: int,
        force_reanalyze: bool,
    ) -> List[TrackForAnalysis]:
        """Return tracks missing analysis or stale relative to the desired version."""

        where_clause = """
            t."filePath" IS NOT NULL AND t."filePath" <> ''
            AND (
                %(force)s = TRUE
                OR aa.id IS NULL
                OR aa."analysisVersion" <> %(version)s
            )
        """
        query = f"""
            SELECT t.id, t."filePath"
            FROM tracks AS t
            LEFT JOIN track_audio_analysis AS aa ON aa."trackId" = t.id
            WHERE {where_clause}
            ORDER BY t."updatedAt" DESC
            LIMIT %(limit)s
        """

        with self._conn.cursor() as cur:
            cur.execute(query, {"force": force_reanalyze, "version": required_version, "limit": limit})
            rows: Sequence[Tuple[str, str]] = cur.fetchall()

        tracks = [TrackForAnalysis(track_id=row[0], file_path=row[1]) for row in rows if row[1]]
        LOGGER.debug("Loaded %s tracks pending analysis", len(tracks))
        return tracks

    def save_analysis(self, result: TrackAnalysisResult) -> None:
        """Persist a completed analysis result to `track_audio_analysis`."""

        payload = result.to_storage_payload()
        instrumentation_json = Json(payload["instrumentation"])
        embedding_json = Json(payload["embedding"]) if payload["embedding"] is not None else None
        payload_json = Json(payload["payload"])

        query = """
            INSERT INTO track_audio_analysis (
                id,
                "trackId",
                "analysisVersion",
                "tempoBpm",
                danceability,
                "energyLevel",
                loudness,
                "dynamicComplexity",
                "musicalKey",
                "musicalScale",
                "keyStrength",
                brightness,
                warmth,
                dissonance,
                genres,
                moods,
                instrumentation,
                "instrumentationCount",
                "compositionYear",
                "compositionDecade",
                keywords,
                summary,
                embedding,
                payload
            ) VALUES (
                %(id)s,
                %(track_id)s,
                %(analysis_version)s,
                %(tempo_bpm)s,
                %(danceability)s,
                %(energy_level)s,
                %(loudness)s,
                %(dynamic_complexity)s,
                %(musical_key)s,
                %(musical_scale)s,
                %(key_strength)s,
                %(brightness)s,
                %(warmth)s,
                %(dissonance)s,
                %(genres)s,
                %(moods)s,
                %(instrumentation)s,
                %(instrumentation_count)s,
                %(composition_year)s,
                %(composition_decade)s,
                %(keywords)s,
                %(summary)s,
                %(embedding)s,
                %(payload)s
            )
            ON CONFLICT ("trackId")
            DO UPDATE SET
                "analysisVersion" = EXCLUDED."analysisVersion",
                "analyzedAt" = CURRENT_TIMESTAMP,
                "tempoBpm" = EXCLUDED."tempoBpm",
                danceability = EXCLUDED.danceability,
                "energyLevel" = EXCLUDED."energyLevel",
                loudness = EXCLUDED.loudness,
                "dynamicComplexity" = EXCLUDED."dynamicComplexity",
                "musicalKey" = EXCLUDED."musicalKey",
                "musicalScale" = EXCLUDED."musicalScale",
                "keyStrength" = EXCLUDED."keyStrength",
                brightness = EXCLUDED.brightness,
                warmth = EXCLUDED.warmth,
                dissonance = EXCLUDED.dissonance,
                genres = EXCLUDED.genres,
                moods = EXCLUDED.moods,
                instrumentation = EXCLUDED.instrumentation,
                "instrumentationCount" = EXCLUDED."instrumentationCount",
                "compositionYear" = EXCLUDED."compositionYear",
                "compositionDecade" = EXCLUDED."compositionDecade",
                keywords = EXCLUDED.keywords,
                summary = EXCLUDED.summary,
                embedding = EXCLUDED.embedding,
                payload = EXCLUDED.payload
        """

        with self._conn.cursor() as cur:
            cur.execute(
                query,
                {
                    "id": uuid4().hex,
                    "track_id": payload["track_id"],
                    "analysis_version": payload["analysis_version"],
                    "tempo_bpm": payload["tempo_bpm"],
                    "danceability": payload["danceability"],
                    "energy_level": payload["energy_level"],
                    "loudness": payload["loudness"],
                    "dynamic_complexity": payload["dynamic_complexity"],
                    "musical_key": payload["musical_key"],
                    "musical_scale": payload["musical_scale"],
                    "key_strength": payload["key_strength"],
                    "brightness": payload["brightness"],
                    "warmth": payload["warmth"],
                    "dissonance": payload["dissonance"],
                    "genres": payload["genres"],
                    "moods": payload["moods"],
                    "instrumentation": instrumentation_json,
                    "instrumentation_count": payload["instrumentation_count"],
                    "composition_year": payload["composition_year"],
                    "composition_decade": payload["composition_decade"],
                    "keywords": payload["keywords"],
                    "summary": payload["summary"],
                    "embedding": embedding_json,
                    "payload": payload_json,
                },
            )
        LOGGER.debug("Saved analysis for track %s", result.track_id)
        self.resolve_failure(result.track_id)

    def record_failure(self, track_id: str, file_path: Optional[str], error: str) -> None:
        """Insert or update a row documenting an analysis failure."""

        query = """
            INSERT INTO track_analysis_failures ("trackId", "filePath", error)
            VALUES (%(track_id)s, %(file_path)s, %(error)s)
        """

        update_query = """
            UPDATE track_analysis_failures
            SET
                "filePath" = COALESCE(%(file_path)s, "filePath"),
                error = %(error)s,
                "retryCount" = "retryCount" + 1,
                "occurredAt" = CURRENT_TIMESTAMP,
                resolved = FALSE
            WHERE "trackId" = %(track_id)s
        """

        with self._conn.cursor() as cur:
            try:
                cur.execute(
                    query,
                    {
                        "track_id": track_id,
                        "file_path": file_path,
                        "error": error,
                    },
                )
            except psycopg.IntegrityError:
                cur.execute(update_query, {"track_id": track_id, "file_path": file_path, "error": error})
        LOGGER.warning("Recorded failure for track %s: %s", track_id, error)

    def resolve_failure(self, track_id: str) -> None:
        """Mark a failed track as resolved after successful analysis."""

        query = """
            UPDATE track_analysis_failures
            SET resolved = TRUE,
                "occurredAt" = CURRENT_TIMESTAMP
            WHERE "trackId" = %(track_id)s
        """

        with self._conn.cursor() as cur:
            cur.execute(query, {"track_id": track_id})
        LOGGER.debug("Marked failure as resolved for track %s", track_id)

    def list_failed_tracks(self, limit: int = 50) -> List[TrackForAnalysis]:
        """Return unresolved failed analyses for retry attempts."""

        query = """
            SELECT "trackId", "filePath"
            FROM track_analysis_failures
            WHERE resolved = FALSE
            ORDER BY "occurredAt" ASC
            LIMIT %(limit)s
        """
        with self._conn.cursor() as cur:
            cur.execute(query, {"limit": limit})
            rows: Sequence[Tuple[str, Optional[str]]] = cur.fetchall()
        return [TrackForAnalysis(track_id=row[0], file_path=row[1] or "") for row in rows if row[1]]

    def get_track_file_path(self, track_id: str) -> Optional[str]:
        """Look up the file path for a given track identifier."""

        query = "SELECT \"filePath\" FROM tracks WHERE id = %(track_id)s"
        with self._conn.cursor() as cur:
            cur.execute(query, {"track_id": track_id})
            row = cur.fetchone()
        if row and row[0]:
            return row[0]
        return None
