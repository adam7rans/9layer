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

export class DownloadService extends EventEmitter {
  private prisma: PrismaClient;
  private downloadQueue: Map<string, DownloadJob> = new Map();
  private activeDownloads: Map<string, AbortController> = new Map();
  private playlistTracking: Map<string, { albumName: string; totalTracks: number; completedTracks: number; trackIds: string[]; }> = new Map();
  private maxConcurrentDownloads: number;

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
    this.maxConcurrentDownloads = env.MAX_CONCURRENT_DOWNLOADS;
    this.setupEventHandlers();
  }

  /**
   * Download audio from YouTube URL
   */
  async downloadAudio(url: string, options: DownloadOptions): Promise<DownloadResult> {
    const jobId = this.generateJobId();

    try {
      // Create download job
      const job: DownloadJob = {
        id: jobId,
        url,
        options,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
        progress: 0,
      };

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
  async getDownloadProgress(jobId: string): Promise<(DownloadProgress & { title?: string; artist?: string; album?: string; youtubeId?: string }) | null> {
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

    return {
      ...base,
      ...extra,
    };
  }

  /**
   * Cancel download
   */
  async cancelDownload(jobId: string): Promise<boolean> {
    const job = this.downloadQueue.get(jobId);
    if (!job) return false;

    // Cancel active download
    const controller = this.activeDownloads.get(jobId);
    if (controller) {
      controller.abort();
      this.activeDownloads.delete(jobId);
    }

    // Remove from queue
    this.downloadQueue.delete(jobId);
    this.emitDownloadEvent('failed', jobId, new Error('Download cancelled'));

    return true;
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
    this.activeDownloads.set(jobId, controller);

    try {
      this.updateJobStatus(jobId, 'downloading');
      job.progress = 0;
      console.log(`[DOWNLOAD] Started job ${jobId} → ${job.url}`);

      // Get video information first
      const videoInfo = await YTDlpWrapper.getVideoInfo(job.url);
      if (!videoInfo) {
        throw new Error('Could not extract video information');
      }

      // Capture basic metadata on the job for frontend display
      if (videoInfo.title) job.title = videoInfo.title;
      if (videoInfo.artist) job.artist = videoInfo.artist;
      // Use album override if provided (for playlist downloads), otherwise use video metadata
      job.album = job.options.albumOverride || videoInfo.album || 'Unknown Album';
      if (videoInfo.youtubeId) job.youtubeId = videoInfo.youtubeId;
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
            lastEmitAt = now;
            lastEmitted = p;
            // Always emit progress updates so SSE clients can render smoothly
            this.emitDownloadEvent('progress', jobId, { progress: p, title: job.title, artist: job.artist, album: job.album, youtubeId: job.youtubeId });
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
        // Save to database
        const track = await this.saveTrackToDatabase(result.metadata, outputPath);
        this.updateJobStatus(jobId, 'completed');
        job.progress = 100;
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
      this.emitDownloadEvent('failed', jobId, error);
      console.error(`[DOWNLOAD] Failed job ${jobId}:`, error);

      return {
        success: false,
        jobId,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    } finally {
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
