#!/usr/bin/env python3
"""
High-level music feature extraction using Essentia TensorFlow models.

Since MusicExtractor profiles don't support tensorflow_models, this module
provides direct API access to Discogs EffNet embeddings + MTG-Jamendo classifiers.

Usage:
    from analysis.highlevel_extract import EssentiaHighLevelExtractor
    
    extractor = EssentiaHighLevelExtractor()
    results = extractor.analyze('track.mp3')
"""

import json
import logging
from pathlib import Path
from typing import Dict, List, Optional

import numpy as np

# Configure logging
logger = logging.getLogger(__name__)


class EssentiaHighLevelExtractor:
    """Extract high-level descriptors using TensorFlow models directly."""

    def __init__(self, models_root: str = "analysis/essentia_models") -> None:
        """Initialise the high-level feature extractor."""

        self.models_root = Path(models_root)

        # Import TensorFlow for model inference
        try:
            import tensorflow as tf
            from essentia.standard import MonoLoader
        except ImportError as exc:  # pragma: no cover - import guarded
            raise ImportError(
                "TensorFlow and Essentia not found. Install with: pip install tensorflow essentia-tensorflow"
            ) from exc

        self.MonoLoader = MonoLoader
        self.tf = tf

        # Model paths
        self.models = {
            "embeddings": {
                "pb": self.models_root
                / "feature-extractors/discogs-effnet/discogs_track_embeddings-effnet-bs64-1.pb",
                "json": self.models_root
                / "feature-extractors/discogs-effnet/discogs_track_embeddings-effnet-bs64-1.json",
            },
            "genre": {
                "pb": self.models_root
                / "classification-heads/mtg_jamendo_genre/mtg_jamendo_genre-discogs_track_embeddings-effnet-1.pb",
                "json": self.models_root
                / "classification-heads/mtg_jamendo_genre/mtg_jamendo_genre-discogs_track_embeddings-effnet-1.json",
            },
            "mood": {
                "pb": self.models_root
                / "classification-heads/mtg_jamendo_moodtheme/mtg_jamendo_moodtheme-discogs_track_embeddings-effnet-1.pb",
                "json": self.models_root
                / "classification-heads/mtg_jamendo_moodtheme/mtg_jamendo_moodtheme-discogs_track_embeddings-effnet-1.json",
            },
            "instrument": {
                "pb": self.models_root
                / "classification-heads/mtg_jamendo_instrument/mtg_jamendo_instrument-discogs_track_embeddings-effnet-1.pb",
                "json": self.models_root
                / "classification-heads/mtg_jamendo_instrument/mtg_jamendo_instrument-discogs_track_embeddings-effnet-1.json",
            },
            "voice": {
                "pb": self.models_root
                / "classification-heads/voice_instrumental/voice_instrumental-discogs-effnet-1.pb",
                "json": self.models_root
                / "classification-heads/voice_instrumental/voice_instrumental-discogs-effnet-1.json",
            },
        }

        self._verify_models()
        self.labels: Dict[str, List[str]] = {}
        self._loaded_models: Dict[str, object] = {}

        for name, paths in self.models.items():
            if name != "embeddings" and paths["json"].exists():
                try:
                    with paths["json"].open("r", encoding="utf-8") as handle:
                        metadata = json.load(handle)
                    classes = metadata.get("classes", [])
                    self.labels[name] = [str(label) for label in classes]
                    logger.debug("Loaded %d classes for %s", len(classes), name)
                except Exception as exc:  # pragma: no cover - defensive
                    logger.warning("Unable to load labels for %s: %s", name, exc)

    def _verify_models(self) -> None:
        """Ensure all required model files exist before running inference."""

        missing: List[str] = []
        for paths in self.models.values():
            for required in ("pb", "json"):
                if not paths[required].exists():
                    missing.append(str(paths[required]))
        if missing:
            joined = "\n  - ".join(missing)
            raise FileNotFoundError(f"Missing model files:\n  - {joined}")

    def _load_graph_def(self, pb_path: Path) -> object:
        """Load a TensorFlow GraphDef from a .pb file."""
        graph_def = self.tf.compat.v1.GraphDef()
        with open(pb_path, "rb") as f:
            graph_def.ParseFromString(f.read())
        return graph_def

    def _get_graph_session(self, graph_def: object) -> tuple:
        """Create a TensorFlow session for graph evaluation."""
        graph = self.tf.Graph()
        with graph.as_default():
            self.tf.compat.v1.import_graph_def(graph_def, name="")
        session = self.tf.compat.v1.Session(graph=graph)
        return graph, session

    def extract_embeddings(self, audio_path: str) -> np.ndarray:
        """Extract Discogs EffNet embeddings from an audio file."""

        try:
            import librosa
        except ImportError:
            raise ImportError("librosa is required for melspectrogram computation. Install with: pip install librosa")

        # Load audio at 16kHz (standard for the model)
        audio, sr = librosa.load(str(audio_path), sr=16000)
        
        # Compute melspectrogram with parameters matching the model expectations
        # Shape should be [batch_size, time_steps, n_mels]
        # The model expects [64, 128, 96] - 128 time steps, 96 mel bands
        mel_spec = librosa.feature.melspectrogram(
            y=audio,
            sr=sr,
            n_fft=2048,
            hop_length=512,
            n_mels=96,
            fmin=0,
            fmax=8000
        )
        
        # Convert power spectrogram to dB scale
        mel_spec_db = librosa.power_to_db(mel_spec, ref=np.max)
        
        # Transpose to get shape [time_steps, n_mels] (librosa returns [n_mels, time_steps])
        mel_spec_db = mel_spec_db.T  # Now shape is [time_steps, 96]
        
        # Normalize to the expected shape [128, 96]
        # Pad or truncate to 128 time steps
        if mel_spec_db.shape[0] > 128:
            mel_spec_db = mel_spec_db[:128, :]
        elif mel_spec_db.shape[0] < 128:
            mel_spec_db = np.pad(mel_spec_db, ((0, 128 - mel_spec_db.shape[0]), (0, 0)), mode='constant')
        
        # Create batch of 64 (model expects this) - shape will be [64, 128, 96]
        mel_spec_batch = np.stack([mel_spec_db] * 64, axis=0).astype(np.float32)
        
        graph_def = self._load_graph_def(self.models["embeddings"]["pb"])
        graph, session = self._get_graph_session(graph_def)

        try:
            # Get the input and output tensors
            # PartitionedCall:0 returns shape (64, 512)
            # PartitionedCall:1 returns shape (64, 1280) - this is what classifiers expect
            input_tensor = graph.get_tensor_by_name("serving_default_melspectrogram:0")
            output_tensor = graph.get_tensor_by_name("PartitionedCall:1")
            
            embeddings = session.run(output_tensor, feed_dict={input_tensor: mel_spec_batch})
            logger.debug("Embeddings extracted with shape %s", embeddings.shape)
            return embeddings
        finally:
            session.close()

    def classify(
        self,
        embeddings: np.ndarray,
        classifier_name: str,
    ) -> Dict[str, object]:
        """Run a specific classifier on embeddings and return prediction scores."""

        model_info = self.models[classifier_name]
        graph_def = self._load_graph_def(model_info["pb"])
        graph, session = self._get_graph_session(graph_def)

        try:
            # Try common input/output node names (model/Placeholder and model/Sigmoid are most common)
            input_nodes = ["model/Placeholder:0", "serving_default_input:0", "input:0"]
            output_nodes = ["model/Sigmoid:0", "model/Softmax:0", "PartitionedCall:0", "output:0"]
            
            for input_node in input_nodes:
                for output_node in output_nodes:
                    try:
                        input_tensor = graph.get_tensor_by_name(input_node)
                        output_tensor = graph.get_tensor_by_name(output_node)
                        
                        logits = session.run(output_tensor, feed_dict={input_tensor: embeddings})
                        scores = np.mean(logits, axis=0) if len(logits.shape) > 1 else logits
                        
                        labels = self.labels.get(classifier_name, [])
                        results = {label: float(scores[idx]) for idx, label in enumerate(labels) if idx < len(scores)}
                        
                        if not results:
                            return {"all": results}
                        
                        top_label, top_score = max(results.items(), key=lambda item: item[1])
                        return {
                            "value": top_label,
                            "probability": top_score,
                            "all": results,
                        }
                    except (KeyError, ValueError, RuntimeError):
                        continue
            
            raise RuntimeError(
                f"Could not run {classifier_name} classifier. Tried input nodes: {input_nodes}, output nodes: {output_nodes}"
            )
        finally:
            session.close()

    def analyze(
        self,
        audio_path: str,
        top_n: int = 10,
        classifiers: Optional[List[str]] = None,
    ) -> Dict[str, object]:
        """Extract high-level descriptors for a single audio file."""

        if classifiers is None:
            classifiers = ["genre", "mood", "instrument", "voice"]

        embeddings = self.extract_embeddings(audio_path)

        results: Dict[str, object] = {}
        for classifier in classifiers:
            output_key = "voice_instrumental" if classifier == "voice" else classifier
            try:
                results[output_key] = self.classify(embeddings, classifier)
            except Exception as exc:  # pragma: no cover - inference failures
                logger.error("%s classification failed: %s", classifier, exc)
                results[output_key] = {"error": str(exc)}

        return results

    def analyze_batch(self, audio_paths: List[str], top_n: int = 10) -> Dict[str, Dict[str, object]]:
        """Process multiple audio files sequentially."""

        return {path: self.analyze(path, top_n=top_n) for path in audio_paths}


def main() -> None:  # pragma: no cover - CLI helper
    import argparse

    parser = argparse.ArgumentParser(description="Run Essentia high-level extraction over audio files")
    parser.add_argument("audio", nargs="+", help="Audio files to analyse")
    parser.add_argument(
        "--models-root",
        default="analysis/essentia_models",
        help="Path to the Essentia models directory",
    )
    parser.add_argument(
        "--output",
        help="Optional JSON output file (defaults to <audio>_highlevel.json)",
    )
    args = parser.parse_args()

    extractor = EssentiaHighLevelExtractor(models_root=args.models_root)

    aggregate: Dict[str, Dict[str, object]] = {}
    for audio_path in args.audio:
        aggregate[audio_path] = extractor.analyze(audio_path)

    if args.output:
        Path(args.output).write_text(json.dumps(aggregate, indent=2), encoding="utf-8")
    else:
        for path, payload in aggregate.items():
            destination = Path(path).with_suffix("_highlevel.json")
            destination.write_text(json.dumps(payload, indent=2), encoding="utf-8")


if __name__ == "__main__":  # pragma: no cover - CLI helper
    logging.basicConfig(level=logging.INFO)
    main()
