import youtubedl from 'youtube-dl-exec';
import * as path from 'path';
import { DownloadOptions, DownloadResult, TrackMetadata } from '../types/api.types';
import { env } from '../config/environment';
import FileUtils from './file-utils';

export class YTDlpWrapper {
  private static readonly DEFAULT_OPTIONS = {
    extractAudio: true,
    audioFormat: 'mp3',
    audioQuality: '192K',
    output: '%(title)s.%(ext)s',
    noPlaylist: true,
    yesPlaylist: false,
  };

  /**
   * Download audio from YouTube URL
   */
  static async downloadAudio(
    url: string,
    options: DownloadOptions
  ): Promise<DownloadResult> {
    try {
      const outputDir = options.outputDir || env.DOWNLOAD_DIR;
      const filenameTemplate = options.filenameTemplate || '%(title)s.%(ext)s';

      // Ensure output directory exists
      await FileUtils.ensureDirectory(outputDir);

      const ytdlpOptions: any = {
        ...YTDlpWrapper.DEFAULT_OPTIONS,
        output: path.join(outputDir, filenameTemplate),
        ...(options.quality && { audioQuality: YTDlpWrapper.mapQualityToNumber(options.quality) }),
        ...(options.format === 'video' && { extractAudio: false }),
      };

      // Execute yt-dlp command
      await youtubedl(url, ytdlpOptions);

      // Extract metadata from the result
      const metadata = await YTDlpWrapper.extractMetadata(url);

      return {
        success: true,
        filePath: ytdlpOptions.output,
        ...(metadata && { metadata }),
      };
    } catch (error) {
      console.error('Download failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown download error',
      };
    }
  }

  /**
   * Get video information without downloading
   */
  static async getVideoInfo(url: string): Promise<TrackMetadata | null> {
    try {
      const result = await youtubedl(url, {
        dumpJson: true,
        skipDownload: true,
        flatPlaylist: true,
      });

      return YTDlpWrapper.parseVideoInfo(result);
    } catch (error) {
      console.error('Failed to get video info:', error);
      return null;
    }
  }

  /**
   * Extract playlist information
   */
  static async getPlaylistInfo(url: string): Promise<TrackMetadata[]> {
    try {
      const result = await youtubedl(url, {
        dumpJson: true,
        skipDownload: true,
        yesPlaylist: true,
        flatPlaylist: false,
      });

      if (Array.isArray(result)) {
        return result.map(YTDlpWrapper.parseVideoInfo).filter(Boolean) as TrackMetadata[];
      } else {
        return [YTDlpWrapper.parseVideoInfo(result)].filter(Boolean) as TrackMetadata[];
      }
    } catch (error) {
      console.error('Failed to get playlist info:', error);
      return [];
    }
  }

  /**
   * Check if URL is a playlist
   */
  static async isPlaylist(url: string): Promise<boolean> {
    try {
      const result = await youtubedl(url, {
        dumpJson: true,
        skipDownload: true,
        flatPlaylist: true,
        playlistItems: '1',
      });

      return Array.isArray(result) && result.length > 1;
    } catch {
      return false;
    }
  }

  /**
   * Get download progress (this would need to be implemented with process spawning)
   */
  static async getDownloadProgress(jobId: string): Promise<number> {
    // This is a placeholder - in a real implementation, you'd track
    // the progress of spawned yt-dlp processes
    console.log(`Getting progress for job ${jobId}`);
    return 0;
  }

  /**
   * Cancel download (this would need to be implemented with process management)
   */
  static async cancelDownload(jobId: string): Promise<boolean> {
    // This is a placeholder - in a real implementation, you'd kill
    // the corresponding yt-dlp process
    console.log(`Cancelling download for job ${jobId}`);
    return true;
  }

  // Private helper methods
  private static mapQualityToNumber(quality: DownloadOptions['quality']): number {
    switch (quality) {
      case 'best': return 320;
      case 'good': return 256;
      case 'medium': return 192;
      case 'worst': return 128;
      default: return 192;
    }
  }

  private static async extractMetadata(url: string): Promise<TrackMetadata | undefined> {
    try {
      const info = await YTDlpWrapper.getVideoInfo(url);
      return info || undefined;
    } catch {
      return undefined;
    }
  }

  private static parseVideoInfo(info: any): TrackMetadata | null {
    if (!info) return null;

    return {
      title: info.title || 'Unknown Title',
      artist: info.uploader || info.creator || 'Unknown Artist',
      album: info.playlist_title || undefined,
      duration: info.duration || 0,
      youtubeId: info.id || undefined,
      thumbnailUrl: info.thumbnail || undefined,
      description: info.description || undefined,
    };
  }
}

// Export default instance
export default YTDlpWrapper;
