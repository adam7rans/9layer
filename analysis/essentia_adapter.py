"""Wrapper utilities for running Essentia feature extraction in 9layer.

This module provides a light abstraction around Essentia's Python API so the
rest of the analysis pipeline can depend on a consistent interface regardless
of whether the underlying extractors change. The adapter also centralizes error
handling and optional fallbacks for environments where certain Essentia models
are unavailable.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import numpy as np

from .metadata import InstrumentationSummary, TrackAnalysisResult
from .highlevel_extract import EssentiaHighLevelExtractor

try:
    import essentia.standard as es  # type: ignore
except ImportError as exc:  # pragma: no cover - runtime guard
    es = None  # type: ignore
    _IMPORT_EXCEPTION = exc
else:
    _IMPORT_EXCEPTION = None


LOGGER = logging.getLogger(__name__)


class EssentiaNotAvailableError(RuntimeError):
    """Raised when Essentia libraries are not importable in the environment."""


@dataclass(slots=True)
class EssentiaConfig:
    """Configuration influencing the adapter's analysis behaviour."""

    model_dir: Optional[Path]
    enable_embeddings: bool = True


class EssentiaAdapter:
    """High-level interface around Essentia feature extraction pipelines."""

    def __init__(self, config: EssentiaConfig) -> None:
        if es is None:
            raise EssentiaNotAvailableError(
                "Essentia is not available. Install essentia and essentia-tensorflow."
            ) from _IMPORT_EXCEPTION
        self._config = config

        extractor_kwargs: Dict[str, Any] = {"lowlevelSilentFrames": "drop"}
        if config.model_dir:
            extractor_kwargs["modelDirectory"] = str(config.model_dir)

        self._music_extractor = es.MusicExtractor(**extractor_kwargs)
        self._rhythm_extractor = es.RhythmExtractor2013(method="multifeature")

        self._highlevel_extractor: Optional[EssentiaHighLevelExtractor]
        models_root = str(config.model_dir) if config.model_dir else "analysis/essentia_models"
        try:
            self._highlevel_extractor = EssentiaHighLevelExtractor(models_root=models_root)
            LOGGER.info("High-level extractor initialised using models in %s", models_root)
        except Exception as exc:  # pragma: no cover - defensive guard
            self._highlevel_extractor = None
            LOGGER.warning("High-level extractor disabled: %s", exc)

    def analyze_file(self, track_id: str, file_path: Path, analysis_version: str) -> TrackAnalysisResult:
        """Run Essentia analysis on the provided audio file and return results."""

        LOGGER.debug("Running Essentia analysis", extra={"track_id": track_id, "path": str(file_path)})
        feature_pool, _ = self._music_extractor(str(file_path))
        features: Any
        if hasattr(feature_pool, "toJson") and callable(feature_pool.toJson):
            try:
                features = json.loads(feature_pool.toJson())
            except Exception:  # pragma: no cover - handle conversion edge cases
                features = self._pool_to_dict(feature_pool)
        else:
            features = self._pool_to_dict(feature_pool)

        if not isinstance(features, dict):
            features = self._pool_to_dict(feature_pool)
        waveform = es.MonoLoader(filename=str(file_path))()
        tempo, _, _, _, _ = self._rhythm_extractor(waveform)

        highlevel_results: Dict[str, Any] = {}
        if self._highlevel_extractor is not None:
            try:
                highlevel_results = self._highlevel_extractor.analyze(str(file_path))
            except Exception as exc:  # pragma: no cover - defensive guard
                LOGGER.warning("High-level extraction failed for %s: %s", file_path, exc)
                highlevel_results = {}

        genres = self._labels_from_highlevel(highlevel_results.get("genre"), threshold=0.0)
        if not genres:
            genres = self._extract_list(features, "highlevel.genre_dortmund.probability")

        moods = self._labels_from_highlevel(highlevel_results.get("mood"), threshold=0.2)
        if not moods:
            moods = self._extract_list(features, "highlevel.mood_acoustic.probability")

        energy = self._extract_float(features, "lowlevel.dynamics.loudness.mean")

        instrumentation = self._instrumentation_from_highlevel(highlevel_results.get("instrument"))
        if instrumentation is None:
            instrumentation = self._infer_instrumentation(features)

        voice_label = None
        voice_section = highlevel_results.get("voice_instrumental") if highlevel_results else None
        if isinstance(voice_section, dict) and not voice_section.get("error"):
            voice_label = voice_section.get("value")

        keywords = self._derive_keywords(genres, moods, instrumentation, voice_label)

        embedding = None
        if self._config.enable_embeddings:
            embedding = self._safe_get_dict(features, "highlevel.embedding")

        payload = self._filter_payload(features)
        if highlevel_results:
            payload["highlevel_tensorflow"] = highlevel_results

        return TrackAnalysisResult(
            track_id=track_id,
            analysis_version=analysis_version,
            tempo_bpm=tempo,
            energy_level=energy,
            genres=genres,
            moods=moods,
            instrumentation=instrumentation,
            composition_year=self._estimate_year(features),
            composition_decade=None,
            keywords=keywords,
            summary=TrackAnalysisResult.build_summary(genres, moods, tempo),
            embedding=embedding,
            payload=payload,
        )

    @staticmethod
    def _extract_list(features: Dict[str, Any], key: str) -> List[str]:
        """Fetch a list of labels with probability thresholds."""

        node = EssentiaAdapter._resolve_key(features, key)
        if not node:
            return []
        if isinstance(node, dict):
            sorted_items = sorted(node.items(), key=lambda item: item[1], reverse=True)
            return [label for label, score in sorted_items if score >= 0.2][:5]
        if isinstance(node, list):
            return [str(item) for item in node][:5]
        return [str(node)]

    @staticmethod
    def _extract_float(features: Dict[str, Any], key: str) -> Optional[float]:
        """Return a floating-point value from the feature dictionary."""

        node = EssentiaAdapter._resolve_key(features, key)
        if isinstance(node, (float, int)):
            return float(node)
        return None

    @staticmethod
    def _safe_get_dict(features: Dict[str, Any], key: str) -> Optional[Dict[str, Any]]:
        """Return a dictionary node if it exists; otherwise None."""

        node = EssentiaAdapter._resolve_key(features, key)
        return node if isinstance(node, dict) else None

    def _infer_instrumentation(self, features: Dict[str, Any]) -> InstrumentationSummary:
        """Derive instrumentation cues using available Essentia high-level tags."""

        instrumentation_node = self._safe_get_dict(features, "highlevel.instrument")
        instruments: Dict[str, float] = {}
        if instrumentation_node:
            for name, score in instrumentation_node.items():
                if isinstance(score, (int, float)) and score >= 0.15:
                    instruments[name] = float(score)

        count = len(instruments) if instruments else None
        return InstrumentationSummary(instruments=instruments, count=count)

    def _derive_keywords(
        self,
        genres: Iterable[str],
        moods: Iterable[str],
        instrumentation: InstrumentationSummary,
        voice_label: Optional[str] = None,
    ) -> List[str]:
        """Build a keyword list used later by natural-language search."""

        terms: List[str] = []
        terms.extend(genres)
        terms.extend(moods)
        terms.extend(instrumentation.instruments.keys())
        if voice_label:
            terms.append(voice_label)
        if instrumentation.count == 1:
            terms.append("solo")
        if instrumentation.count and instrumentation.count > 4:
            terms.append("ensemble")
        return sorted({term.lower() for term in terms if term})

    @staticmethod
    def _labels_from_highlevel(data: Optional[Dict[str, Any]], threshold: float, top_n: int = 5) -> List[str]:
        """Convert high-level classifier output into an ordered label list."""

        if not isinstance(data, dict) or data.get("error"):
            return []

        scores = data.get("all") or {}
        if not scores and data.get("value"):
            return [str(data["value"])]

        sorted_items = sorted(scores.items(), key=lambda item: item[1], reverse=True)
        labels = [label for label, score in sorted_items if score >= threshold][:top_n]
        if labels:
            return labels
        if data.get("value"):
            return [str(data["value"])]
        return []

    @staticmethod
    def _instrumentation_from_highlevel(data: Optional[Dict[str, Any]]) -> Optional[InstrumentationSummary]:
        """Build an InstrumentationSummary from high-level results if possible."""

        if not isinstance(data, dict) or data.get("error"):
            return None

        scores = data.get("all") or {}
        if not scores and data.get("value"):
            value = str(data["value"])
            return InstrumentationSummary(instruments={value: float(data.get("probability", 0.0))}, count=1)

        instruments = {
            str(name): float(score)
            for name, score in scores.items()
            if isinstance(score, (int, float)) and score >= 0.15
        }
        if not instruments:
            return None

        return InstrumentationSummary(instruments=instruments, count=len(instruments))

    def _estimate_year(self, features: Dict[str, Any]) -> Optional[int]:
        """Estimate composition year when Essentia provides related metadata."""

        year = self._extract_float(features, "metadata.audio_properties.year")
        if year is not None:
            return int(year)
        return None

    def _filter_payload(self, features: Dict[str, Any]) -> Dict[str, Any]:
        """Persist a trimmed feature dict to limit storage usage."""

        allowed_prefixes = (
            "highlevel.genre",
            "highlevel.mood",
            "highlevel.instrument",
            "highlevel.voice",
        )
        payload: Dict[str, Any] = {}
        for key, value in features.items():
            if key.startswith(allowed_prefixes):
                payload[key] = value
        payload["version"] = features.get("version")
        payload["essentia"] = features.get("essentia")
        payload["analysis_timestamp"] = features.get("analysisinfo", {}).get("datetime")
        if isinstance(features.get("metadata"), dict):
            payload["metadata"] = features["metadata"]
        return payload

    @staticmethod
    def _pool_to_dict(node: Any) -> Any:
        """Recursively convert Essentia pools and arrays into nested Python primitives."""

        if hasattr(node, "descriptorNames") and callable(node.descriptorNames):
            result: Dict[str, Any] = {}
            for descriptor in node.descriptorNames():
                try:
                    raw_value = node[descriptor]
                except Exception:  # pragma: no cover - defensively handle unexpected descriptors
                    continue
                EssentiaAdapter._assign_descriptor(
                    result,
                    descriptor.split("."),
                    EssentiaAdapter._convert_essentia_value(raw_value),
                )
            return result
        return EssentiaAdapter._convert_essentia_value(node)

    @staticmethod
    def _assign_descriptor(target: Dict[str, Any], path: List[str], value: Any) -> None:
        """Populate a nested mapping given a descriptor path."""

        key = path[0]
        if len(path) == 1:
            target[key] = value
            return
        existing = target.get(key)
        if not isinstance(existing, dict):
            existing = {}
            target[key] = existing
        EssentiaAdapter._assign_descriptor(existing, path[1:], value)

    @staticmethod
    def _convert_essentia_value(value: Any) -> Any:
        """Convert Essentia-specific types into Python-native structures."""

        if hasattr(value, "descriptorNames") and callable(value.descriptorNames):
            return EssentiaAdapter._pool_to_dict(value)
        if isinstance(value, dict):
            return {k: EssentiaAdapter._convert_essentia_value(v) for k, v in value.items()}
        if isinstance(value, (list, tuple)):
            return [EssentiaAdapter._convert_essentia_value(item) for item in value]
        if isinstance(value, np.ndarray):
            return value.tolist()
        if hasattr(value, "tolist") and callable(value.tolist):
            try:
                return value.tolist()
            except TypeError:  # pragma: no cover - guard against non-callable tolist attributes
                return value
        return value

    @staticmethod
    def _resolve_key(tree: Dict[str, Any], dotted_key: str) -> Optional[Any]:
        """Traverse nested dictionaries using dotted key notation."""

        parts = dotted_key.split(".")
        cursor: Any = tree
        for part in parts:
            if isinstance(cursor, dict) and part in cursor:
                cursor = cursor[part]
            else:
                return None
        return cursor

    @staticmethod
    def serialize_features(features: Dict[str, Any]) -> str:
        """Convert Essentia's feature dict into a stable JSON blob."""

        return json.dumps(features, default=float, ensure_ascii=False)
