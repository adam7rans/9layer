"""Domain models describing Essentia-derived audio metadata for 9layer.

The classes defined here provide a strongly typed contract between the raw
outputs produced by Essentia extractors and the storage/search layers of the
application. Keeping the data model separate allows the rest of the pipeline to
reason in terms of rich Python objects while still offering helpers to serialize
records for Postgres persistence or JSON interchange with the TypeScript
backend.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence


@dataclass(slots=True)
class InstrumentationSummary:
    """Represents detected instruments and estimated prominence levels."""

    instruments: Dict[str, float] = field(default_factory=dict)
    count: Optional[int] = None

    def as_record(self) -> Dict[str, object]:
        """Return a JSON-serializable mapping for storage."""

        return {
            "instruments": self.instruments,
            "count": self.count,
        }

    @classmethod
    def from_record(cls, record: Optional[Dict[str, object]]) -> "InstrumentationSummary":
        """Rehydrate an `InstrumentationSummary` from stored JSON."""

        if not record:
            return cls()
        instruments = {
            str(name): float(score)
            for name, score in (record.get("instruments") or {}).items()  # type: ignore[arg-type]
        }
        count_value = record.get("count") if isinstance(record, dict) else None
        count = int(count_value) if isinstance(count_value, (int, float)) else None
        return cls(instruments=instruments, count=count)


@dataclass(slots=True)
class TrackAnalysisResult:
    """Container for audio metadata derived from Essentia analysis."""

    track_id: str
    analysis_version: str

    # Rhythm features
    tempo_bpm: Optional[float]
    danceability: Optional[float] = None

    # Energy and dynamics
    energy_level: Optional[float] = None
    loudness: Optional[float] = None
    dynamic_complexity: Optional[float] = None

    # Tonal features
    musical_key: Optional[str] = None
    musical_scale: Optional[str] = None
    key_strength: Optional[float] = None

    # Timbre and spectral
    brightness: Optional[float] = None
    warmth: Optional[float] = None
    dissonance: Optional[float] = None

    # High-level classifications
    genres: List[str] = field(default_factory=list)
    moods: List[str] = field(default_factory=list)
    instrumentation: InstrumentationSummary = field(default_factory=InstrumentationSummary)

    # Metadata
    composition_year: Optional[int] = None
    composition_decade: Optional[int] = None
    keywords: List[str] = field(default_factory=list)
    summary: Optional[str] = None

    # Advanced features
    embedding: Optional[Dict[str, Sequence[float]]] = None
    payload: Dict[str, object] = field(default_factory=dict)

    def to_storage_payload(self) -> Dict[str, object]:
        """Prepare a dictionary ready for database insertion."""

        decade = self.composition_decade
        if decade is None and self.composition_year is not None:
            decade = (self.composition_year // 10) * 10

        return {
            "track_id": self.track_id,
            "analysis_version": self.analysis_version,
            # Rhythm
            "tempo_bpm": self.tempo_bpm,
            "danceability": self.danceability,
            # Energy and dynamics
            "energy_level": self.energy_level,
            "loudness": self.loudness,
            "dynamic_complexity": self.dynamic_complexity,
            # Tonal
            "musical_key": self.musical_key,
            "musical_scale": self.musical_scale,
            "key_strength": self.key_strength,
            # Timbre and spectral
            "brightness": self.brightness,
            "warmth": self.warmth,
            "dissonance": self.dissonance,
            # High-level classifications
            "genres": self.genres,
            "moods": self.moods,
            "instrumentation": self.instrumentation.as_record(),
            "instrumentation_count": self.instrumentation.count,
            # Metadata
            "composition_year": self.composition_year,
            "composition_decade": decade,
            "keywords": self.keywords,
            "summary": self.summary,
            # Advanced
            "embedding": self.embedding,
            "payload": self.payload,
        }

    @classmethod
    def from_storage_payload(cls, payload: Dict[str, object]) -> "TrackAnalysisResult":
        """Create an instance from database payloads used in caching."""

        instrumentation_record = payload.get("instrumentation")
        instrumentation = InstrumentationSummary.from_record(
            instrumentation_record if isinstance(instrumentation_record, dict) else None
        )

        return cls(
            track_id=str(payload["track_id"]),
            analysis_version=str(payload.get("analysis_version", "")),
            tempo_bpm=float(payload["tempo_bpm"]) if payload.get("tempo_bpm") is not None else None,
            energy_level=float(payload["energy_level"]) if payload.get("energy_level") is not None else None,
            genres=[str(item) for item in payload.get("genres", [])],
            moods=[str(item) for item in payload.get("moods", [])],
            instrumentation=instrumentation,
            composition_year=int(payload["composition_year"]) if payload.get("composition_year") else None,
            composition_decade=int(payload["composition_decade"]) if payload.get("composition_decade") else None,
            keywords=[str(item) for item in payload.get("keywords", [])],
            summary=str(payload.get("summary")) if payload.get("summary") else None,
            embedding=payload.get("embedding") if isinstance(payload.get("embedding"), dict) else None,
            payload=payload.get("payload") if isinstance(payload.get("payload"), dict) else {},
        )

    @staticmethod
    def build_summary(genres: Sequence[str], moods: Sequence[str], tempo: Optional[float]) -> Optional[str]:
        """Construct a human-readable summary string for quick display."""

        fragments: List[str] = []
        if genres:
            fragments.append(
                "Genre: " + ", ".join(genres[:3]) + ("..." if len(genres) > 3 else "")
            )
        if moods:
            fragments.append("Mood: " + ", ".join(moods[:3]))
        if tempo:
            fragments.append(f"Tempo: {tempo:.1f} BPM")
        return " | ".join(fragments) if fragments else None
