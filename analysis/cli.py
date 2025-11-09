"""Command-line interface for the 9layer Essentia analysis toolkit.

This CLI enables operators and backend services to trigger audio analysis
routines, inspect failure queues, and generally orchestrate Essentia-powered
metadata extraction outside of the Fastify runtime. The entry points here are
used both manually (via shell) and programmatically (spawned from Node.js).
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from typing import Iterable, List

from .pipeline import AnalysisPipeline, BatchSummary

LOGGER = logging.getLogger(__name__)


def _configure_logging(verbose: bool) -> None:
    """Configure root logging for CLI execution."""

    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(level=level, format="[%(levelname)s] %(name)s: %(message)s")


def _json_summary(summary: BatchSummary) -> str:
    """Serialize a `BatchSummary` as a JSON string for machine consumers."""

    return json.dumps(summary.to_dict(), ensure_ascii=False)


def analyze_pending(limit: int | None) -> int:
    """Analyze queued tracks up to the optional limit."""

    with AnalysisPipeline() as pipeline:
        summary = pipeline.analyze_pending(limit=limit)
        print(_json_summary(summary))
    return 0


def analyze_tracks(track_ids: Iterable[str]) -> int:
    """Analyze one or more explicit track identifiers."""

    track_list: List[str] = list(track_ids)
    if not track_list:
        print(json.dumps({"error": "No track IDs supplied"}))
        return 1

    with AnalysisPipeline() as pipeline:
        summary = pipeline.analyze_specific_tracks(track_list)
        print(_json_summary(summary))
    return 0


def retry_failures(limit: int | None) -> int:
    """Retry tracks that previously failed analysis."""

    with AnalysisPipeline() as pipeline:
        summary = pipeline.retry_failures(limit=limit)
        print(_json_summary(summary))
    return 0


def main(argv: List[str] | None = None) -> int:
    """Entry point parsing CLI arguments and dispatching commands."""

    parser = argparse.ArgumentParser(description="9layer Essentia analysis CLI")
    parser.add_argument("--verbose", action="store_true", help="Enable debug logging")

    subparsers = parser.add_subparsers(dest="command", required=True)

    pending_parser = subparsers.add_parser("analyze-pending", help="Process queued tracks")
    pending_parser.add_argument("--limit", type=int, default=None, help="Max tracks to analyze")

    track_parser = subparsers.add_parser("analyze-tracks", help="Process explicit track IDs")
    track_parser.add_argument("track_ids", nargs="+", help="Track identifiers to analyze")

    retry_parser = subparsers.add_parser("retry-failures", help="Retry failed analyses")
    retry_parser.add_argument("--limit", type=int, default=None, help="Max failures to retry")

    args = parser.parse_args(argv)
    _configure_logging(args.verbose)

    if args.command == "analyze-pending":
        return analyze_pending(args.limit)
    if args.command == "analyze-tracks":
        return analyze_tracks(args.track_ids)
    if args.command == "retry-failures":
        return retry_failures(args.limit)

    print(json.dumps({"error": f"Unknown command: {args.command}"}))
    return 1


if __name__ == "__main__":  # pragma: no cover - CLI entry point
    sys.exit(main())
