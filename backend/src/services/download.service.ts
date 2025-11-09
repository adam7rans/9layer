import { EventEmitter } from 'events';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import {
  DownloadOptions,
  DownloadResult,
  DownloadProgress,
  DownloadJob,
  DownloadEvent
} from '../types/api.types';
import YTDlpWrapper from '../utils/yt-dlp';
import FileUtils from '../utils/file-utils';
import { env } from '../config/environment';
import { AudioAnalysisService } from './audio-analysis.service';

type ActiveDownloadTracker = {
  controller: AbortController;
  watchdog?: NodeJS.Timeout;
};

export class DownloadService extends EventEmitter {
  private static readonly STALL_DETECT_SECONDS = 30;
  private static readonly STALL_TIMEOUT_SECONDS = 120;
  private static readonly STALL_CHECK_INTERVAL_MS = 5000;
  private static readonly FAILED_JOB_RETENTION_MS = 3600000; // Keep failed jobs for 1 hour

  private prisma: PrismaClient;
  private downloadQueue: Map<string, DownloadJob> = new Map();
  private activeDownloads: Map<string, ActiveDownloadTracker> = new Map();
  private playlistTracking: Map<string, { albumName: string; totalTracks: number; completedTracks: number; trackIds: string[]; }> = new Map();
  private maxConcurrentDownloads: number;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private audioAnalysisService: AudioAnalysisService | undefined;

  constructor(prisma: PrismaClient, audioAnalysisService?: AudioAnalysisService) {
    super();
    this.prisma = prisma;
    this.audioAnalysisService = audioAnalysisService;
    this.maxConcurrentDownloads = env.MAX_CONCURRENT_DOWNLOADS;
    this.setupEventHandlers();
    this.startCleanupTimer();
  }

  public destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Clean up old completed/failed jobs from queue to prevent memory leaks
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [jobId, job] of this.downloadQueue.entries()) {
        // Remove completed jobs after 5 minutes
        if (job.status === 'completed' && now - job.updatedAt.getTime() > 300000) {
          this.downloadQueue.delete(jobId);
          console.log(`[CLEANUP] Removed completed job ${jobId}`);
        }
        // Remove failed jobs after retention period (1 hour)
        if (job.status === 'failed' && now - job.updatedAt.getTime() > DownloadService.FAILED_JOB_RETENTION_MS) {
          this.downloadQueue.delete(jobId);
          console.log(`[CLEANUP] Removed expired failed job ${jobId}`);
        }
      }
    }, 60000); // Run every minute
  }

  private async recordMissingTrack(job: DownloadJob, reason: string, code?: string): Promise<void> {
    try {
      const artist = job.artist ?? job.options.artist ?? 'Unknown Artist';
      const title = job.title ?? job.options.title ?? job.url;
      const album = job.album ?? job.options.album ?? job.options.albumOverride ?? 'Unknown Album';
      const youtubeId = job.youtubeId ?? job.options.youtubeId ?? undefined;
      const note = code ? `${reason} (code: ${code})` : reason;

      const prismaAny = this.prisma as any;

      if (youtubeId) {
        await prismaAny.missingTrack.upsert({
          where: { youtubeId },
          update: {
            artist,
            title,
            album,
            status: 'PENDING',
            reason: note,
          },
          create: {
            artist,
            title,
            album,
            youtubeId,
            status: 'PENDING',
            reason: note,
          },
        });
        return;
      }

      await prismaAny.missingTrack.upsert({
        where: {
          artist_title_album: {
            artist,
            title,
            album,
          },
        },
        update: {
          status: 'PENDING',
          reason: note,
        },
        create: {
          artist,
          title,
          album,
          status: 'PENDING',
          reason: note,
        },
      });
    } catch (recordError) {
      console.error('Failed to record missing track:', recordError);
    }
  }

  /**
   * Download audio from YouTube URL
   */
  async downloadAudio(url: string, options: DownloadOptions): Promise<DownloadResult> {
    const jobId = this.generateJobId();

    try {
      // Create download job
      const now = new Date();
      const job: DownloadJob = {
        id: jobId,
        url,
        options,
        status: 'pending',
        createdAt: now,
        updatedAt: now,
        progress: 0,
        lastProgressAt: now,
      };

      if (options.title !== undefined) job.title = options.title;
      if (options.artist !== undefined) job.artist = options.artist;
      if (options.album !== undefined) {
        job.album = options.album;
      } else if (options.albumOverride !== undefined) {
        job.album = options.albumOverride;
      }
      if (options.youtubeId !== undefined) job.youtubeId = options.youtubeId;

      this.downloadQueue.set(jobId, job);
      this.emitDownloadEvent('started', jobId, job);

      // Check if we can start download immediately
      if (this.activeDownloads.size < this.maxConcurrentDownloads) {
        const result = await this.processDownload(jobId);
        // Ensure jobId is present in response
        return { ...result, jobId };
      } else {
        // Queue the download
        this.updateJobStatus(jobId, 'pending');
        return {
          success: true,
          jobId, // Return job ID for tracking
        };
      }
    } catch (error) {
      this.emitDownloadEvent('failed', jobId, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get download progress
   */
  async getDownloadProgress(jobId: string): Promise<(DownloadProgress & { title?: string; artist?: string; album?: string; youtubeId?: string; errorMessage?: string; errorCode?: string }) | null> {
    const job = this.downloadQueue.get(jobId);
    if (!job) return null;

    const base: DownloadProgress = {
      jobId,
      status: job.status,
      progress: job.progress ?? 0,
      currentSpeed: '0 KB/s',
      eta: 'Unknown',
    };

    const extra: { title?: string; artist?: string; album?: string; youtubeId?: string } = {};
    if (job.title) extra.title = job.title;
    if (job.artist) extra.artist = job.artist;
    if (job.album) extra.album = job.album;
    if (job.youtubeId) extra.youtubeId = job.youtubeId;

    const payload: DownloadProgress & {
      title?: string;
      artist?: string;
      album?: string;
      youtubeId?: string;
      errorMessage?: string;
      errorCode?: string;
      stallDetected?: boolean;
      stallSecondsRemaining?: number;
    } = {
      ...base,
      ...extra,
    };

    if (job.errorMessage !== undefined) payload.errorMessage = job.errorMessage;
    if (job.errorCode !== undefined) payload.errorCode = job.errorCode;
    if (job.stallDetectedAt) {
      payload.stallDetected = true;
      const deadline = job.stallDeadline?.getTime();
      if (deadline) {
        const remaining = Math.max(0, Math.round((deadline - Date.now()) / 1000));
        payload.stallSecondsRemaining = remaining;
      }
    }

    return payload;
  }

  /**
   * Cancel download
   */
  async cancelDownload(jobId: string): Promise<boolean> {
    const job = this.downloadQueue.get(jobId);
    if (!job) return false;

    // Cancel active download
    const tracker = this.activeDownloads.get(jobId);
    if (tracker) {
      tracker.controller.abort();
      if (tracker.watchdog) clearInterval(tracker.watchdog);
      this.activeDownloads.delete(jobId);
    }

    // Mark as failed but keep in queue for potential retry
    this.updateJobStatus(jobId, 'failed');
    job.errorMessage = 'Download cancelled by user';
    job.errorCode = 'CANCELLED';
    this.emitDownloadEvent('failed', jobId, new Error('Download cancelled'));

    return true;
  }

  async retryDownload(jobId: string): Promise<DownloadResult & { previousJobId: string }> {
    const existing = this.downloadQueue.get(jobId);
    if (!existing) {
      return {
        success: false,
        error: `Download job ${jobId} not found`,
        previousJobId: jobId,
      } as DownloadResult & { previousJobId: string };
    }

    const cloneOptions: DownloadOptions = { ...existing.options };
    if (existing.title !== undefined) cloneOptions.title = existing.title;
    else if (existing.options.title !== undefined) cloneOptions.title = existing.options.title;

    if (existing.artist !== undefined) cloneOptions.artist = existing.artist;
    else if (existing.options.artist !== undefined) cloneOptions.artist = existing.options.artist;

    if (existing.album !== undefined) cloneOptions.album = existing.album;
    else if (existing.options.album !== undefined) cloneOptions.album = existing.options.album;

    if (existing.youtubeId !== undefined) cloneOptions.youtubeId = existing.youtubeId;
    else if (existing.options.youtubeId !== undefined) cloneOptions.youtubeId = existing.options.youtubeId;

    const res = await this.downloadAudio(existing.url, cloneOptions);

    if (res.success && res.jobId) {
      this.emitDownloadEvent('retry_started', res.jobId, {
        previousJobId: jobId,
        newJobId: res.jobId,
        title: existing.title,
        artist: existing.artist,
        album: existing.album,
        youtubeId: existing.youtubeId,
      });
    }

    return {
      ...res,
      previousJobId: jobId,
    } as DownloadResult & { previousJobId: string };
  }

  /**
   * Process queued downloads
   */
  private async processQueue(): Promise<void> {
    const pendingJobs = Array.from(this.downloadQueue.entries())
      .filter(([_, job]) => job.status === 'pending')
      .slice(0, this.maxConcurrentDownloads - this.activeDownloads.size);

    for (const [jobId] of pendingJobs) {
      this.processDownload(jobId);
    }
  }

  /**
   * Process individual download
   */
  private async processDownload(jobId: string): Promise<DownloadResult> {
    const job = this.downloadQueue.get(jobId);
    if (!job) {
      throw new Error(`Job ${jobId} not found`);
    }

    // Create abort controller for this download
    const controller = new AbortController();
    const watchdog = this.startStallWatchdog(jobId, controller);
    const tracker: ActiveDownloadTracker = watchdog ? { controller, watchdog } : { controller };
    this.activeDownloads.set(jobId, tracker);

    try {
      this.updateJobStatus(jobId, 'downloading');
      job.progress = 0;
      console.log(`[DOWNLOAD] Started job ${jobId} → ${job.url}`);

      // Get video information first (with extractor fallback)
      const infoContext = await YTDlpWrapper.getVideoInfoWithContext(job.url, job.options.extractorArgs);
      const videoInfo = infoContext.metadata;
      if (!videoInfo) {
        throw new Error('Could not extract video information');
      }

      if (infoContext.extractorArgs) {
        job.options.extractorArgs = infoContext.extractorArgs;
      }

      if (videoInfo.title !== undefined) job.title = videoInfo.title;
      if (videoInfo.artist !== undefined) job.artist = videoInfo.artist;
      const albumResolved = job.options.albumOverride ?? (videoInfo.album ?? 'Unknown Album');
      job.album = albumResolved;
      if (videoInfo.youtubeId !== undefined) job.youtubeId = videoInfo.youtubeId;
      job.updatedAt = new Date();

      // Emit a metadata-bearing started event so the UI has titles even before progress
      this.emitDownloadEvent('started', jobId, {
        title: job.title,
        artist: job.artist,
        album: job.album,
        youtubeId: job.youtubeId,
        progress: job.progress ?? 0,
      });

      // Create output directory structure
      // If caller provided explicit outputDir/filenameTemplate, honor them.
      // Otherwise, compute based on extracted metadata.
      const computedOutputDir = FileUtils.createMusicDirectoryStructure(
        env.DOWNLOAD_DIR,
        videoInfo.artist,
        videoInfo.album || 'Misc'
      );
      const outputDir = job.options.outputDir || computedOutputDir;

      // Generate or use provided filename template
      const computedFilename = FileUtils.generateTrackFilename(videoInfo.title);
      const filename = job.options.filenameTemplate || computedFilename;
      const outputPath = path.join(outputDir, filename);

      // Update job options with computed values
      const downloadOptions: DownloadOptions = {
        ...job.options,
        outputDir,
        filenameTemplate: filename,
      };

      // Perform download with progress
      let lastLogged = 0;
      let lastEmitAt = 0;
      let lastEmitted = 0;
      const result = await YTDlpWrapper.downloadAudioWithProgress(job.url, downloadOptions, {
        onProgress: (percent) => {
          // Keep one-decimal precision for smoother UI updates
          const p = Math.max(0, Math.min(100, Math.round(percent * 10) / 10));
          const now = Date.now();
          const changedEnough = Math.abs(p - (lastEmitted || 0)) >= 0.1 || now - lastEmitAt >= 100 || p === 100;
          if (changedEnough) {
            job.progress = p;
            job.updatedAt = new Date();
            job.lastProgressAt = new Date();
            if (job.stallDetectedAt || job.stallDeadline) {
              delete job.stallDetectedAt;
              delete job.stallDeadline;
              this.emitDownloadEvent('stall_cleared', jobId, {
                title: job.title,
                artist: job.artist,
                album: job.album,
                youtubeId: job.youtubeId,
              });
            }
            lastEmitAt = now;
            lastEmitted = p;
            // Always emit progress updates so SSE clients can render smoothly
            this.emitDownloadEvent('progress', jobId, {
              progress: p,
              title: job.title,
              artist: job.artist,
              album: job.album,
              youtubeId: job.youtubeId,
            });
            // Keep console noise lower, but still show movement
            if (p - lastLogged >= 1 || p === 100) {
              console.log(`[DOWNLOAD] Job ${jobId} progress: ${p}%`);
              lastLogged = Math.floor(p);
            }
          }
        },
        abortSignal: controller.signal as any,
        durationSeconds: videoInfo.duration || 0,
      });

      if (result.success && result.metadata) {
        // Ensure progress reaches 100% before completing
        // (important for already-downloaded files that yt-dlp skips)
        if (job.progress !== 100) {
          job.progress = 100;
          job.updatedAt = new Date();
          job.lastProgressAt = new Date();
          // Clear any stall detection
          if (job.stallDetectedAt || job.stallDeadline) {
            delete job.stallDetectedAt;
            delete job.stallDeadline;
            this.emitDownloadEvent('stall_cleared', jobId, {
              title: job.title,
              artist: job.artist,
              album: job.album,
              youtubeId: job.youtubeId,
            });
          }
          this.emitDownloadEvent('progress', jobId, {
            progress: 100,
            title: job.title,
            artist: job.artist,
            album: job.album,
            youtubeId: job.youtubeId,
          });
        }

        // Save to database
        const track = await this.saveTrackToDatabase(result.metadata, outputPath);
        this.audioAnalysisService?.enqueueTrackAnalysis(track.id);
        this.updateJobStatus(jobId, 'completed');
        console.log(`[DOWNLOAD] Completed job ${jobId} (${videoInfo.title})`);

        this.emitDownloadEvent('completed', jobId, {
          ...result,
          trackId: track.id,
        });

        // Check if this completes a playlist/album
        this.checkPlaylistCompletion(job, track.id);

        return {
          success: true,
          jobId,
          trackId: track.id,
          filePath: outputPath,
          metadata: result.metadata,
        };
      } else {
        throw new Error(result.error || 'Download failed');
      }
    } catch (error) {
      this.updateJobStatus(jobId, 'failed');
      job.progress = 0;
      const err = error as any;
      let message = err?.message || String(error);
      const code = err?.code ?? err?.status ?? err?.exitCode ?? undefined;

      if (message === 'AbortError' && job.errorMessage) {
        message = job.errorMessage;
      }
      if (message !== undefined) job.errorMessage = message;
      if (code !== undefined) job.errorCode = String(code);

      this.emitDownloadEvent('failed', jobId, {
        message,
        code: job.errorCode,
        title: job.title,
        artist: job.artist,
        album: job.album,
        youtubeId: job.youtubeId,
      });
      console.error(`[DOWNLOAD] Failed job ${jobId}:`, message, code ? `(code: ${code})` : '');

      await this.recordMissingTrack(job, message, job.errorCode);

      const failure: DownloadResult = {
        success: false,
        jobId,
        error: message,
      };
      if (job.errorCode !== undefined) failure.errorCode = job.errorCode;
      return failure;
    } finally {
      const tracker = this.activeDownloads.get(jobId);
      if (tracker?.watchdog) clearInterval(tracker.watchdog);
      this.activeDownloads.delete(jobId);
      // Process next item in queue
      this.processQueue();
    }
  }

  /**
   * Save track metadata to database
   */
  private async saveTrackToDatabase(metadata: any, filePath: string) {
    // Find or create artist
    let artist = await this.prisma.artist.findFirst({
      where: { name: metadata.artist },
    });

    if (!artist) {
      artist = await this.prisma.artist.create({
        data: { name: metadata.artist },
      });
    }

    // Find or create album
    let album = await this.prisma.album.findFirst({
      where: {
        title: metadata.album || 'Unknown Album',
        artistId: artist.id,
      },
    });

    if (!album) {
      album = await this.prisma.album.create({
        data: {
          title: metadata.album || 'Unknown Album',
          artistId: artist.id,
        },
      });
    }

    // If track with this youtubeId exists, update filePath/fileSize instead of creating new
    let track = null as any;
    if (metadata.youtubeId) {
      track = await this.prisma.track.findFirst({ where: { youtubeId: metadata.youtubeId } });
    }

    const fileSize = await (await FileUtils.getFileInfo(filePath))?.size || 0;

    if (track) {
      track = await this.prisma.track.update({
        where: { id: track.id },
        data: {
          title: metadata.title,
          artistId: artist.id,
          albumId: album.id,
          duration: metadata.duration,
          filePath,
          fileSize,
          updatedAt: new Date(),
        },
      });
    } else {
      track = await this.prisma.track.create({
        data: {
          title: metadata.title,
          artistId: artist.id,
          albumId: album.id,
          duration: metadata.duration,
          filePath,
          youtubeId: metadata.youtubeId,
          fileSize,
        },
      });
    }

    return track;
  }

  /**
   * Update job status
   */
  private updateJobStatus(jobId: string, status: DownloadJob['status']): void {
    const job = this.downloadQueue.get(jobId);
    if (job) {
      job.status = status;
      job.updatedAt = new Date();
    }
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `download_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start tracking playlist/album download
   */
  startPlaylistTracking(playlistId: string, albumName: string, totalTracks: number): void {
    this.playlistTracking.set(playlistId, {
      albumName,
      totalTracks,
      completedTracks: 0,
      trackIds: []
    });
    console.log(`[PLAYLIST] Started tracking: ${albumName} (${totalTracks} tracks)`);
  }

  private startStallWatchdog(jobId: string, controller: AbortController): NodeJS.Timeout | undefined {
    if (DownloadService.STALL_TIMEOUT_SECONDS <= 0) return undefined;

    const timer = setInterval(() => {
      const job = this.downloadQueue.get(jobId);
      if (!job) {
        clearInterval(timer);
        return;
      }

      if (job.status !== 'downloading') {
        clearInterval(timer);
        return;
      }

      const lastProgress = job.lastProgressAt?.getTime() ?? job.createdAt.getTime();
      const elapsedSeconds = (Date.now() - lastProgress) / 1000;

      const detectThreshold = DownloadService.STALL_DETECT_SECONDS;
      const timeoutThreshold = DownloadService.STALL_TIMEOUT_SECONDS;

      if (!job.stallDetectedAt && elapsedSeconds >= detectThreshold) {
        job.stallDetectedAt = new Date();
        const remainingSeconds = Math.max(0, Math.round(timeoutThreshold - elapsedSeconds));
        job.stallDeadline = new Date(Date.now() + remainingSeconds * 1000);
        this.emitDownloadEvent('stall_detected', jobId, {
          title: job.title,
          artist: job.artist,
          album: job.album,
          youtubeId: job.youtubeId,
          stallSecondsRemaining: remainingSeconds,
        });
        return;
      }

      if (job.stallDetectedAt) {
        const deadlineMs = job.stallDeadline?.getTime() ?? (job.stallDetectedAt.getTime() + (timeoutThreshold - detectThreshold) * 1000);
        const remainingSeconds = Math.max(0, Math.round((deadlineMs - Date.now()) / 1000));

        if (remainingSeconds > 0) {
          this.emitDownloadEvent('stall_detected', jobId, {
            title: job.title,
            artist: job.artist,
            album: job.album,
            youtubeId: job.youtubeId,
            stallSecondsRemaining: remainingSeconds,
          });
          return;
        }

        const reason = 'Timed out waiting 120s for download progress (possible network issue).';
        job.errorMessage = reason;
        job.errorCode = 'STALL_TIMEOUT';
        this.emitDownloadEvent('stall_timeout', jobId, {
          title: job.title,
          artist: job.artist,
          album: job.album,
          youtubeId: job.youtubeId,
          message: reason,
        });
        controller.abort();
        clearInterval(timer);
      }
    }, DownloadService.STALL_CHECK_INTERVAL_MS);

    return timer;
  }

  /**
   * Update playlist completion and check if album is done
   */
  private checkPlaylistCompletion(job: DownloadJob, trackId: string): void {
    if (!job.album) return;

    const albumKey = job.album;
    const tracking = this.playlistTracking.get(albumKey);
    if (!tracking) return;

    // Add this track ID to the completed tracks
    tracking.trackIds.push(trackId);
    tracking.completedTracks++;
    console.log(`[PLAYLIST] ${albumKey}: ${tracking.completedTracks}/${tracking.totalTracks} tracks completed`);

    if (tracking.completedTracks >= tracking.totalTracks) {
      console.log(`[PLAYLIST] Album completed: ${tracking.albumName}`);
      console.log(`[PLAYLIST] Track IDs being sent:`, tracking.trackIds);
      this.emitDownloadEvent('album_completed', albumKey, {
        albumName: tracking.albumName,
        totalTracks: tracking.totalTracks,
        trackIds: tracking.trackIds // Include the specific track IDs for this album
      });
      const failedJobs = Array.from(this.downloadQueue.values()).filter(j => j.album === job.album && j.status === 'failed');
      this.emitDownloadEvent('playlist_summary', albumKey, {
        albumName: tracking.albumName,
        totalTracks: tracking.totalTracks,
        completedTracks: tracking.completedTracks,
        failed: failedJobs.map(j => ({
          title: j.title,
          youtubeId: j.youtubeId,
          reason: j.errorMessage,
        })),
      });
      this.playlistTracking.delete(albumKey);
    }
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle download completion to process queue
    this.on('download:completed', () => {
      this.processQueue();
    });

    this.on('download:failed', () => {
      this.processQueue();
    });

    // Log all download events for visibility in terminal
    this.on('download', (event) => {
      const { type, jobId, data } = event as any;
      if (type === 'started') {
        console.log(`[DOWNLOAD] Event: started job ${jobId}`);
      } else if (type === 'progress') {
        const p = typeof data?.progress === 'number' ? `${data.progress}%` : '';
        console.log(`[DOWNLOAD] Event: progress job ${jobId} ${p}`);
      } else if (type === 'completed') {
        console.log(`[DOWNLOAD] Event: completed job ${jobId}`);
      } else if (type === 'failed') {
        console.error(`[DOWNLOAD] Event: failed job ${jobId}:`, data);
      } else {
        console.log(`[DOWNLOAD] Event: ${type} job ${jobId}`);
      }
    });
  }

  /**
   * Emit download event
   */
  private emitDownloadEvent(type: DownloadEvent['type'], jobId: string, data: any): void {
    const event: DownloadEvent = {
      type,
      jobId,
      data,
    };

    this.emit('download', event);
    this.emit(`download:${type}`, event);
  }

  /**
   * Get queue status
   */
  getQueueStatus(): { pending: number; active: number; total: number } {
    const jobs = Array.from(this.downloadQueue.values());
    return {
      pending: jobs.filter(job => job.status === 'pending').length,
      active: jobs.filter(job => job.status === 'downloading').length,
      total: this.downloadQueue.size,
    };
  }
}

// Export default instance factory
export default DownloadService;
