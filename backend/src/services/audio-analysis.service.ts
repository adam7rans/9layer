/**
 * Audio analysis service responsible for invoking the Essentia-powered Python
 * pipeline and exposing a lightweight job queue for the Fastify backend.
 */

import { spawn } from 'child_process';
import path from 'path';
import { env } from '../config/environment.js';

export interface AnalysisRunResult {
  success: boolean;
  command: string[];
  startedAt: string;
  finishedAt: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  summary?: Record<string, unknown>;
  errorMessage?: string;
}

interface AudioAnalysisServiceOptions {
  pythonBin: string;
  cliPath: string;
  batchSize: number;
  maxWorkers: number;
  forceReanalyze: boolean;
  enableEmbeddings: boolean;
  cacheDir: string;
  modelDir?: string;
}

interface CurrentJobSnapshot {
  command: string[];
  startedAt: string;
  trackIds?: string[];
  type: 'queue' | 'tracks' | 'pending' | 'retry';
}

export interface AnalysisServiceStatus {
  queueDepth: number;
  pendingTrackIds: string[];
  running: boolean;
  currentJob?: CurrentJobSnapshot;
  lastResult?: AnalysisRunResult;
}

/**
 * AudioAnalysisService bridges the Fastify backend with the Essentia CLI.
 */
export class AudioAnalysisService {
  private readonly options: AudioAnalysisServiceOptions;
  private readonly cliAbsolutePath: string;
  private readonly queue: string[] = [];
  private readonly queueSet: Set<string> = new Set();
  private processingQueue = false;
  private currentJob?: CurrentJobSnapshot;
  private lastResult?: AnalysisRunResult;
  private initialScanTriggered = false;

  constructor(options?: Partial<AudioAnalysisServiceOptions>) {
    const merged: AudioAnalysisServiceOptions = {
      pythonBin: options?.pythonBin ?? env.ANALYSIS_PYTHON_BIN,
      cliPath: options?.cliPath ?? env.ANALYSIS_CLI_PATH,
      batchSize: options?.batchSize ?? env.ANALYSIS_BATCH_SIZE,
      maxWorkers: options?.maxWorkers ?? env.ANALYSIS_MAX_WORKERS,
      forceReanalyze: options?.forceReanalyze ?? env.ANALYSIS_FORCE_REANALYZE,
      enableEmbeddings: options?.enableEmbeddings ?? env.ANALYSIS_ENABLE_EMBEDDINGS,
      cacheDir: options?.cacheDir ?? env.ANALYSIS_CACHE_DIR,
      ...(options?.modelDir
        ? { modelDir: options.modelDir }
        : env.ANALYSIS_MODEL_DIR
        ? { modelDir: env.ANALYSIS_MODEL_DIR }
        : {}),
    };

    this.options = merged;
    this.cliAbsolutePath = path.isAbsolute(merged.cliPath)
      ? merged.cliPath
      : path.resolve(process.cwd(), merged.cliPath);
  }

  /**
   * Queue a track for asynchronous analysis via the background worker.
   */
  enqueueTrackAnalysis(trackId: string): void {
    if (!trackId || this.queueSet.has(trackId)) {
      return;
    }
    this.queue.push(trackId);
    this.queueSet.add(trackId);
    void this.processQueue();
  }

  /**
   * Analyze a set of tracks immediately, bypassing the background queue.
   */
  async analyzeTracks(trackIds: string[]): Promise<AnalysisRunResult> {
    if (!trackIds.length) {
      return {
        success: false,
        command: ['analyze-tracks'],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        exitCode: null,
        stdout: '',
        stderr: '',
        errorMessage: 'No track IDs supplied',
      };
    }

    return this.runCommand(['analyze-tracks', ...trackIds], {
      type: 'tracks',
      trackIds,
    });
  }

  /**
   * Analyze pending tracks that are missing Essentia metadata.
   */
  async analyzePending(limit?: number): Promise<AnalysisRunResult> {
    const args = ['analyze-pending'];
    if (typeof limit === 'number' && limit > 0) {
      args.push('--limit', String(limit));
    }
    return this.runCommand(args, { type: 'pending' });
  }

  /**
   * Retry failed analyses recorded in the failure table.
   */
  async retryFailures(limit?: number): Promise<AnalysisRunResult> {
    const args = ['retry-failures'];
    if (typeof limit === 'number' && limit > 0) {
      args.push('--limit', String(limit));
    }
    return this.runCommand(args, { type: 'retry' });
  }

  /**
   * Trigger a one-time scan of existing tracks shortly after startup.
   */
  scheduleInitialScan(): void {
    if (this.initialScanTriggered) {
      return;
    }
    this.initialScanTriggered = true;
    void this.analyzePending().catch(error => {
      this.lastResult = {
        success: false,
        command: ['analyze-pending'],
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        exitCode: null,
        stdout: '',
        stderr: String(error),
        errorMessage: 'Initial analysis scan failed',
      };
    });
  }

  /**
   * Return the current queue state and last-known results.
   */
  getStatus(): AnalysisServiceStatus {
    const status: AnalysisServiceStatus = {
      queueDepth: this.queue.length,
      pendingTrackIds: Array.from(this.queueSet.values()),
      running: this.processingQueue,
    };
    if (this.currentJob) {
      status.currentJob = this.currentJob;
    }
    if (this.lastResult) {
      status.lastResult = this.lastResult;
    }
    return status;
  }

  /**
   * Stop background processing and clear outstanding jobs.
   */
  shutdown(): void {
    this.queue.length = 0;
    this.queueSet.clear();
    this.processingQueue = false;
    delete this.currentJob;
  }

  private async processQueue(): Promise<void> {
    if (this.processingQueue || !this.queue.length) {
      return;
    }

    const batch: string[] = [];
    while (batch.length < this.options.batchSize && this.queue.length) {
      const next = this.queue.shift();
      if (!next) {
        continue;
      }
      batch.push(next);
      this.queueSet.delete(next);
    }

    if (!batch.length) {
      return;
    }

    this.processingQueue = true;
    this.currentJob = {
      command: ['analyze-tracks', ...batch],
      startedAt: new Date().toISOString(),
      trackIds: batch,
      type: 'queue',
    };

    try {
      this.lastResult = await this.runCommand(['analyze-tracks', ...batch], {
        type: 'queue',
        trackIds: batch,
      });
    } catch (error) {
      const startedAtIso = this.currentJob?.startedAt ?? new Date().toISOString();
      this.lastResult = {
        success: false,
        command: ['analyze-tracks', ...batch],
        startedAt: startedAtIso,
        finishedAt: new Date().toISOString(),
        exitCode: null,
        stdout: '',
        stderr: String(error),
        errorMessage: 'Queued analysis failed',
      };
    } finally {
      this.processingQueue = false;
      delete this.currentJob;
      if (this.queue.length) {
        void this.processQueue();
      }
    }
  }

  private async runCommand(
    commandArgs: string[],
    snapshot: Partial<CurrentJobSnapshot>,
  ): Promise<AnalysisRunResult> {
    const startedAt = new Date();
    const command: string[] = commandArgs;

    const childEnv = {
      ...process.env,
      ANALYSIS_BATCH_SIZE: String(this.options.batchSize),
      ANALYSIS_MAX_WORKERS: String(this.options.maxWorkers),
      ANALYSIS_FORCE_REANALYZE: String(this.options.forceReanalyze),
      ANALYSIS_ENABLE_EMBEDDINGS: String(this.options.enableEmbeddings),
      ANALYSIS_CACHE_DIR: this.options.cacheDir,
    } as NodeJS.ProcessEnv;

    if (this.options.modelDir) {
      childEnv.ANALYSIS_MODEL_DIR = this.options.modelDir;
    }
    childEnv.PYTHONUNBUFFERED = '1';

    return new Promise<AnalysisRunResult>((resolve) => {
      const child = spawn(this.options.pythonBin, [this.cliAbsolutePath, ...command], {
        env: childEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', chunk => {
        stderr += chunk.toString();
      });

      const onClose = (code: number | null) => {
        const finishedAt = new Date();
        let summary: Record<string, unknown> | undefined;
        let errorMessage: string | undefined;

        const trimmed = stdout.trim();
        if (trimmed) {
          try {
            summary = JSON.parse(trimmed) as Record<string, unknown>;
          } catch (error) {
            errorMessage = `Failed to parse CLI output: ${String(error)}`;
          }
        }

        if (code !== 0) {
          const stderrMessage = stderr.trim() || `CLI exited with code ${code}`;
          errorMessage = errorMessage ?? stderrMessage;
        }

        const result: AnalysisRunResult = {
          success: code === 0 && !errorMessage,
          command,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          exitCode: code,
          stdout,
          stderr,
        };
        if (summary !== undefined) {
          result.summary = summary;
        }
        if (errorMessage !== undefined) {
          result.errorMessage = errorMessage;
        }

        resolve(result);
      };

      child.on('error', err => {
        const finishedAt = new Date();
        resolve({
          success: false,
          command,
          startedAt: startedAt.toISOString(),
          finishedAt: finishedAt.toISOString(),
          exitCode: null,
          stdout,
          stderr: `${stderr}${err instanceof Error ? err.message : String(err)}`,
          errorMessage: 'Failed to spawn analysis CLI',
        });
      });

      child.on('close', onClose);

      const currentJob: CurrentJobSnapshot = {
        command,
        startedAt: startedAt.toISOString(),
        type: snapshot.type ?? 'tracks',
      };
      if (snapshot.trackIds) {
        currentJob.trackIds = snapshot.trackIds;
      }
      this.currentJob = currentJob;
    });
  }
}
