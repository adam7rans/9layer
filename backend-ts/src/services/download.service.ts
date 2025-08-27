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
      };

      this.downloadQueue.set(jobId, job);
      this.emitDownloadEvent('started', jobId, job);

      // Check if we can start download immediately
      if (this.activeDownloads.size < this.maxConcurrentDownloads) {
        return await this.processDownload(jobId);
      } else {
        // Queue the download
        this.updateJobStatus(jobId, 'pending');
        return {
          success: true,
          trackId: jobId, // Return job ID for tracking
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
  async getDownloadProgress(jobId: string): Promise<DownloadProgress | null> {
    const job = this.downloadQueue.get(jobId);
    if (!job) return null;

    return {
      jobId,
      status: job.status,
      progress: 0, // Placeholder - would need process monitoring
      currentSpeed: '0 KB/s', // Placeholder
      eta: 'Unknown', // Placeholder
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

      // Get video information first
      const videoInfo = await YTDlpWrapper.getVideoInfo(job.url);
      if (!videoInfo) {
        throw new Error('Could not extract video information');
      }

      // Create output directory structure
      const outputDir = FileUtils.createMusicDirectoryStructure(
        env.DOWNLOAD_DIR,
        videoInfo.artist,
        videoInfo.album
      );

      // Generate filename
      const filename = FileUtils.generateTrackFilename(videoInfo.title);
      const outputPath = path.join(outputDir, filename);

      // Update job options with computed values
      const downloadOptions: DownloadOptions = {
        ...job.options,
        outputDir,
        filenameTemplate: filename,
      };

      // Perform download
      const result = await YTDlpWrapper.downloadAudio(job.url, downloadOptions);

      if (result.success && result.metadata) {
        // Save to database
        const track = await this.saveTrackToDatabase(result.metadata, outputPath);
        this.updateJobStatus(jobId, 'completed');

        this.emitDownloadEvent('completed', jobId, {
          ...result,
          trackId: track.id,
        });

        return {
          success: true,
          trackId: track.id,
          filePath: outputPath,
          metadata: result.metadata,
        };
      } else {
        throw new Error(result.error || 'Download failed');
      }
    } catch (error) {
      this.updateJobStatus(jobId, 'failed');
      this.emitDownloadEvent('failed', jobId, error);

      return {
        success: false,
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

    // Create track
    const track = await this.prisma.track.create({
      data: {
        title: metadata.title,
        artistId: artist.id,
        albumId: album.id,
        duration: metadata.duration,
        filePath,
        youtubeId: metadata.youtubeId,
        fileSize: await FileUtils.getFileInfo(filePath)?.then(info => info?.size || 0) || 0,
      },
    });

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
