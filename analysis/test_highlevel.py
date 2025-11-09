#!/usr/bin/env python3
"""Quick smoke tests for Essentia high-level extraction."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional


def _pick_audio(base: str = "NA") -> Optional[Path]:
    search_roots = ["**/*.mp3", "**/*.wav", "**/*.flac"]
    root_path = Path(base)
    for pattern in search_roots:
        candidates = list(root_path.glob(pattern))
        if candidates:
            return candidates[0]
    return None


def test_standalone() -> bool:
    """Exercise the EssentiaHighLevelExtractor class directly."""

    print("=" * 80)
    print("TEST 1: analysis.highlevel_extract")
    print("=" * 80)

    try:
        from analysis.highlevel_extract import EssentiaHighLevelExtractor
    except ImportError as exc:  # pragma: no cover - import guard
        print(f"✗ Unable to import EssentiaHighLevelExtractor: {exc}")
        return False

    try:
        extractor = EssentiaHighLevelExtractor(models_root="analysis/essentia_models")
    except Exception as exc:  # pragma: no cover - defensive
        print(f"✗ Failed to initialise extractor: {exc}")
        return False

    audio = _pick_audio()
    if audio is None:
        print("⚠ No audio files found under NA/. Place a test MP3 there to run this check.")
        return False

    print(f"Analyzing {audio}")
    try:
        results = extractor.analyze(str(audio))
    except Exception as exc:  # pragma: no cover - inference failures
        print(f"✗ Extraction failed: {exc}")
        return False

    for name, payload in results.items():
        if isinstance(payload, dict) and "error" not in payload:
            value = payload.get("value", "<n/a>")
            probability = payload.get("probability", 0.0)
            print(f"  {name:18s}: {value} ({probability:.3f})")
    return True


def test_adapter_integration() -> bool:
    """Ensure EssentiaAdapter delegates to the high-level extractor."""

    print("\n" + "=" * 80)
    print("TEST 2: analysis.essentia_adapter")
    print("=" * 80)

    try:
        from analysis.essentia_adapter import EssentiaAdapter, EssentiaConfig
    except ImportError as exc:  # pragma: no cover
        print(f"✗ Unable to import EssentiaAdapter: {exc}")
        return False

    try:
        config = EssentiaConfig(model_dir=None, enable_embeddings=True)
        adapter = EssentiaAdapter(config)
    except Exception as exc:  # pragma: no cover - defensive
        print(f"✗ Failed to initialise EssentiaAdapter: {exc}")
        return False

    audio = _pick_audio()
    if audio is None:
        print("⚠ No audio files found under NA/. Place a test MP3 there to run this check.")
        return False

    print(f"Analyzing {audio}")
    try:
        highlevel = adapter._highlevel_extractor.analyze(str(audio)) if adapter._highlevel_extractor else {}
    except Exception as exc:  # pragma: no cover
        print(f"✗ Adapter high-level extraction failed: {exc}")
        return False

    if not highlevel:
        print("✗ Adapter returned no high-level results")
        return False

    for name, payload in highlevel.items():
        if isinstance(payload, dict) and "error" not in payload:
            value = payload.get("value", "<n/a>")
            probability = payload.get("probability", 0.0)
            print(f"  {name:18s}: {value} ({probability:.3f})")
    return True


def main() -> int:
    print("\nESSENTIA HIGH-LEVEL EXTRACTION TESTS\n")

    standalone = test_standalone()
    adapter = test_adapter_integration()

    print("\n" + "=" * 80)
    print("SUMMARY")
    print("=" * 80)
    print(f"Standalone extractor : {'✓ PASSED' if standalone else '✗ FAILED'}")
    print(f"Adapter integration  : {'✓ PASSED' if adapter else '✗ FAILED'}")

    if standalone and adapter:
        print("\n✓ All checks succeeded")
        return 0

    print("\n✗ One or more checks failed")
    return 1


if __name__ == "__main__":  # pragma: no cover - CLI helper
    sys.exit(main())
