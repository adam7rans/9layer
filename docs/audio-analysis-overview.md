# 9layer Audio Analysis Overview

## Introduction
The 9layer backend now integrates an Essentia-powered Python toolkit that enriches tracks with deep audio metadata. This document captures the pipeline design, operational guidance, and a suggested roadmap for natural-language search.

## Architecture Summary
- **Python package**: Located in `analysis/` with modular components:
  - `config.py`: environment loading and defaults (`AnalysisSettings`).
  - `metadata.py`: typed domain models and helpers for storage serialization.
  - `essentia_adapter.py`: wrapper around `essentia.standard` extractors with defensive error handling.
  - `storage.py`: Postgres access via `psycopg`, upserting into `track_audio_analysis` and tracking failures.
  - `pipeline.py`: batch orchestration with multiprocessing workers and reusable `AnalysisPipeline` API.
  - `cli.py`: entry point (`analyze-pending`, `analyze-tracks`, `retry-failures`).
- **TypeScript bridge** (`backend/src/services/audio-analysis.service.ts`): launches the CLI, maintains a lightweight queue, exposes status, and handles automatic startup scans.
- **Download integration**: `DownloadService` (`backend/src/services/download.service.ts`) enqueues Essentia analysis immediately after saving a track.
- **Fastify routes**: `/analysis/status`, `/analysis/pending`, `/analysis/tracks`, `/analysis/retry` registered via `backend/src/routes/analysis.routes.ts` for UI/CLI control.

## Database Schema
The Prisma schema (`backend/prisma/schema.prisma`) introduces:
- `TrackAudioAnalysis`: single-row-per-track metadata (genres, moods, energy, tempo, instrumentation, embeddings, summary, payload).
- `TrackAnalysisFailure`: retry log for failed analyses.
Tracks (`Track` model) expose `analysis` and `analysisFailures` relations, enabling Prisma joins.

## Environment Variables
Defined in `backend/src/config/environment.ts` and consumed by Python settings:
- `ANALYSIS_PYTHON_BIN` (default `python3`).
- `ANALYSIS_CLI_PATH` (default `analysis/cli.py`).
- `ANALYSIS_BATCH_SIZE`, `ANALYSIS_MAX_WORKERS`, `ANALYSIS_FORCE_REANALYZE`, `ANALYSIS_ENABLE_EMBEDDINGS`.
- `ANALYSIS_MODEL_DIR`, `ANALYSIS_CACHE_DIR`.
Ensure `DATABASE_URL` matches the Postgres instance accessible to both Node.js and Python.

## Operational Guide
1. **Install dependencies** (example):
```bash
pip install essentia essentia-tensorflow psycopg[binary]
```
2. **Run migrations**:
```bash
npx prisma migrate dev --name add_audio_analysis
```
3. **Smoke test CLI**:
```bash
python analysis/cli.py analyze-pending --limit 5
```
4. **Server runtime**: Fastify auto-invokes `AudioAnalysisService.scheduleInitialScan()` on boot and queues new downloads automatically.
5. **Monitoring**: Use `/analysis/status` to inspect queue depth, last run summaries, and active jobs.

## Failure Handling
- All exceptions during extraction are recorded in `track_analysis_failures` with retry counts.
- CLI `retry-failures` command and REST endpoint allow batch retries.
- Successful saves automatically call `AnalysisStorage.resolve_failure()` to clear stale entries.

## Natural-Language Search Scaffolding
To power queries such as "minimalist solo piano from the 1960s":
- **Metadata fields**: `genres`, `moods`, `instrumentation` (JSON map + count), `tempoBpm`, `energyLevel`, `compositionYear/Decade`, `keywords`, `summary`, optional vector `embedding`.
- **Parser sketch**:
  - Tokenize user input with keyword dictionaries (e.g., instrument synonyms, mood adjectives, tempo ranges) and date recognizers.
  - Map tokens to structured filters (genre list, energy buckets, tempo ranges, instrumentation counts, decade/year intervals).
  - Fallback to text search across `summary` and `keywords` for residual terms.
- **Search service integration** (`backend/src/services/search.service.ts`): extend query builder to join `TrackAudioAnalysis` and apply filters. Start by adding optional `analysis` filters to the existing Prisma call, exposing them via API parameters.
- **Future enhancements**: leverage embeddings for semantic similarity (store normalized vector from Essentia or additional models), enabling cosine-distance ranking.

## Next Steps Checklist
- **Run**: Prisma migration + Python dependency setup.
- **Configure**: Set analysis env vars in deployment manifests.
- **Integrate UI/CLI**: Hook REST endpoints into admin dashboard or CLI wrappers.
- **Search roadmap**: Implement parser + filterable API, then expose NL search beta in frontend.

## References
- Essentia documentation: https://essentia.upf.edu/documentation.html
- Prisma relation mapping: see `backend/prisma/schema.prisma`
- Pipeline entry point: `analysis/cli.py`
