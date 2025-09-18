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

      // Ensure temp directory on the target drive to avoid filling system tmp
      const tempDir = path.join(env.DOWNLOAD_DIR, 'temp');
      await FileUtils.ensureDirectory(tempDir);

      const ytdlpOptions: any = {
        ...YTDlpWrapper.DEFAULT_OPTIONS,
        output: path.join(outputDir, filenameTemplate),
        paths: { temp: tempDir },
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

  // Parse ffmpeg progress line time=HH:MM:SS.xx and return seconds
  private static parseFfmpegTimeSeconds(text: string): number | null {
    const m = text.match(/time=(\d{2}):(\d{2}):(\d{2})(?:[\.,](\d+))?/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const mi = parseInt(m[2], 10);
    const s = parseInt(m[3], 10);
    const frac = m[4] ? parseInt(m[4], 10) : 0;
    const seconds = h * 3600 + mi * 60 + s + (frac ? frac / Math.pow(10, m[4]!.length) : 0);
    if (!isFinite(seconds)) return null;
    return seconds;
  }

  // Parse ffmpeg -progress key out_time_ms=NNN lines → seconds
  private static parseFfmpegOutTimeMs(text: string): number | null {
    const m = text.match(/out_time_ms=(\d+)/);
    if (!m) return null;
    const ms = parseInt(m[1], 10);
    if (!isFinite(ms)) return null;
    return ms / 1000000; // ffmpeg out_time_ms is microseconds
  }

  /**
   * Download audio and report progress via callback.
   * The onProgress callback will receive percentage [0-100].
   */
  static async downloadAudioWithProgress(
    url: string,
    options: DownloadOptions,
    ctx?: { onProgress?: (percent: number, raw?: string) => void; abortSignal?: AbortSignal; durationSeconds?: number }
  ): Promise<DownloadResult> {
    try {
      const outputDir = options.outputDir || env.DOWNLOAD_DIR;
      const filenameTemplate = options.filenameTemplate || '%(title)s.%(ext)s';

      await FileUtils.ensureDirectory(outputDir);

      const tempDir = path.join(env.DOWNLOAD_DIR, 'temp');
      await FileUtils.ensureDirectory(tempDir);

      const ytdlpOptions: any = {
        ...YTDlpWrapper.DEFAULT_OPTIONS,
        output: path.join(outputDir, filenameTemplate),
        paths: { temp: tempDir },
        ...(options.quality && { audioQuality: YTDlpWrapper.mapQualityToNumber(options.quality) }),
        ...(options.format === 'video' && { extractAudio: false }),
        noWarnings: true,
        ignoreErrors: true,
        // Force newline-separated progress updates and an easy-to-parse template
        newline: true,
        // Include percent and bytes so we can compute when percent is NA
        progressTemplate: 'PROGRESS:%(progress._percent_str)s|%(progress.downloaded_bytes)d|%(progress.total_bytes)d',
        // Increase progress frequency (seconds between updates)
        progressDelta: 0.3,
        // Make sure progress is printed and not suppressed
        progress: true,
        quiet: false,
        // Ask ffmpeg (post-processor) to report detailed progress to stderr
        // so we can show smooth updates during conversion as well
        ppa: ['FFmpegExtractAudio:-progress pipe:2 -nostats'],
      };

      const subprocess: any = (youtubedl as any).exec(url, ytdlpOptions, {
        signal: ctx?.abortSignal,
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });

      // Progress lines are emitted on stderr by yt-dlp; some environments may send to stdout
      let lastLogAt = 0;
      const handleChunk = (buf: Buffer) => {
        const full = buf.toString();
        // Split by both newline and carriage return to catch ffmpeg's \r updates
        const lines = full.split(/\r|\n/).filter(Boolean);
        for (const line of lines) {
          let pct = YTDlpWrapper.parseProgressPercent(line);
          if (pct === null && ctx?.durationSeconds) {
            // Try ffmpeg time=HH:MM:SS.xx style
            const t = YTDlpWrapper.parseFfmpegTimeSeconds(line) ?? YTDlpWrapper.parseFfmpegOutTimeMs(line);
            if (t !== null && ctx.durationSeconds > 0) {
              pct = Math.max(0, Math.min(100, (t / ctx.durationSeconds) * 100));
            }
          }
          if (pct === null) {
            // Try to parse bytes from our custom template: PROGRESS:<percent>|<downloaded>|<total>
            const bm = line.match(/PROGRESS:\s*([^|]+)\|(\d+)\|(\d+)/);
            if (bm) {
              const downloaded = parseInt(bm[2], 10);
              const total = parseInt(bm[3], 10);
              if (isFinite(downloaded) && isFinite(total) && total > 0) {
                pct = Math.max(0, Math.min(100, (downloaded / total) * 100));
              }
            }
          }
          // Temporary debug: throttle raw progress logs to once per 500ms
          const now = Date.now();
          if (now - lastLogAt > 500) {
            console.log('[yt-dlp progress raw]', line);
            if (pct !== null) console.log('[yt-dlp progress %]', Math.round(pct));
            lastLogAt = now;
          }
          if (pct !== null) ctx?.onProgress?.(pct, line);
        }
      };
      subprocess.stderr?.on('data', handleChunk);
      subprocess.stdout?.on('data', handleChunk);

      await subprocess; // wait until finished

      const metadata = await YTDlpWrapper.extractMetadata(url);
      return {
        success: true,
        filePath: ytdlpOptions.output,
        ...(metadata && { metadata }),
      };
    } catch (error) {
      const e = error as any;
      console.error('Download with progress failed:', e?.message || e);
      if (e?.stdout) console.error('[yt-dlp stdout]', e.stdout.toString().slice(0, 2000));
      if (e?.stderr) console.error('[yt-dlp stderr]', e.stderr.toString().slice(0, 2000));
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Unknown download error',
      };
    }
  }

  /**
   * Normalize YouTube Music playlist URLs to standard www.youtube.com form so yt-dlp handles them consistently.
   * Examples:
   *  - https://music.youtube.com/playlist?list=XYZ -> https://www.youtube.com/playlist?list=XYZ
   */
  private static normalizeUrl(input: string): string {
    try {
      const u = new URL(input);
      const list = u.searchParams.get('list');
      if (u.hostname.includes('music.youtube.com') && list) {
        return `https://www.youtube.com/playlist?list=${encodeURIComponent(list)}`;
      }
      return input;
    } catch {
      return input;
    }
  }

  /**
   * Get video information without downloading
   */
  static async getVideoInfo(url: string): Promise<TrackMetadata | null> {
    try {
      const normalized = YTDlpWrapper.normalizeUrl(url);
      const result = await youtubedl(normalized, {
        dumpJson: true,
        skipDownload: true,
        noWarnings: true,
        ignoreErrors: true,
        flatPlaylist: true,
      });

      return YTDlpWrapper.parseVideoInfo(result);
    } catch (error) {
      const e = error as any;
      console.error('Failed to get video info:', e?.message || e);
      if (e?.stdout) console.error('[yt-dlp stdout]', e.stdout.toString().slice(0, 2000));
      if (e?.stderr) console.error('[yt-dlp stderr]', e.stderr.toString().slice(0, 2000));
      return null;
    }
  }

  /**
   * Get playlist metadata (title, description, etc.) without entries
   */
  static async getPlaylistMetadata(url: string): Promise<{ title?: string; description?: string; uploader?: string } | null> {
    try {
      const normalized = YTDlpWrapper.normalizeUrl(url);
      const result: any = await youtubedl(normalized, {
        dumpSingleJson: true,
        skipDownload: true,
        yesPlaylist: true,
        flatPlaylist: false,
        playlistItems: '1',
        noWarnings: true,
        ignoreErrors: true,
      });

      if (result && typeof result === 'object') {
        return {
          title: result.title || result.playlist_title || undefined,
          description: result.description || undefined,
          uploader: result.uploader || result.playlist_uploader || undefined,
        };
      }

      return null;
    } catch (error) {
      console.error('Failed to get playlist metadata:', error);
      return null;
    }
  }

  /**
   * Extract playlist information
   */
  static async getPlaylistInfo(url: string): Promise<TrackMetadata[]> {
    try {
      const normalized = YTDlpWrapper.normalizeUrl(url);
      // Try to force a single JSON with entries[] using dumpSingleJson
      const result: any = await youtubedl(normalized, {
        dumpSingleJson: true,
        skipDownload: true,
        yesPlaylist: true,
        flatPlaylist: true,
        noWarnings: true,
        ignoreErrors: true,
        // fetch a large range of items if needed
        playlistItems: '1-10000',
      });

      // yt-dlp may return:
      // - an object with entries[] for playlists
      // - an array of entries
      // - a single object
      // - a newline-separated string of JSON objects (one per entry)
      if (typeof result === 'string') {
        const lines = result
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean);
        const entries: any[] = [];
        for (const line of lines) {
          try {
            const obj = JSON.parse(line);
            entries.push(obj);
          } catch {}
        }
        if (entries.length > 0) {
          return entries.map(YTDlpWrapper.parseVideoInfo).filter(Boolean) as TrackMetadata[];
        }
      }
      if (result && Array.isArray(result.entries)) {
        return result.entries.map(YTDlpWrapper.parseVideoInfo).filter(Boolean) as TrackMetadata[];
      }
      if (Array.isArray(result)) {
        return result.map(YTDlpWrapper.parseVideoInfo).filter(Boolean) as TrackMetadata[];
      }
      let firstPass = [YTDlpWrapper.parseVideoInfo(result)].filter(Boolean) as TrackMetadata[];
      if (firstPass.length > 0) return firstPass;

      // Retry with dumpJson (newline separated) to catch per-entry JSON objects
      const flatResult: any = await youtubedl(normalized, {
        dumpJson: true,
        skipDownload: true,
        yesPlaylist: true,
        flatPlaylist: true,
        noWarnings: true,
        ignoreErrors: true,
        playlistItems: '1-10000',
      });
      if (typeof flatResult === 'string') {
        const lines = flatResult.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const entries: any[] = [];
        for (const line of lines) {
          try { entries.push(JSON.parse(line)); } catch {}
        }
        if (entries.length > 0) {
          return entries.map(YTDlpWrapper.parseVideoInfo).filter(Boolean) as TrackMetadata[];
        }
      }
      if (flatResult && Array.isArray(flatResult.entries)) {
        return flatResult.entries.map(YTDlpWrapper.parseVideoInfo).filter(Boolean) as TrackMetadata[];
      }
      if (Array.isArray(flatResult)) {
        return flatResult.map(YTDlpWrapper.parseVideoInfo).filter(Boolean) as TrackMetadata[];
      }

      // As a last resort, try the original URL (without normalization)
      if (normalized !== url) {
        const fallback: any = await youtubedl(url, {
          dumpSingleJson: true,
          skipDownload: true,
          yesPlaylist: true,
          flatPlaylist: true,
          noWarnings: true,
          ignoreErrors: true,
          playlistItems: '1-10000',
        });
        if (fallback && Array.isArray(fallback.entries)) {
          return fallback.entries.map(YTDlpWrapper.parseVideoInfo).filter(Boolean) as TrackMetadata[];
        }
        if (Array.isArray(fallback)) {
          return fallback.map(YTDlpWrapper.parseVideoInfo).filter(Boolean) as TrackMetadata[];
        }
        if (typeof fallback === 'string') {
          const lines = fallback.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          const entries: any[] = [];
          for (const line of lines) {
            try { entries.push(JSON.parse(line)); } catch {}
          }
          if (entries.length > 0) {
            return entries.map(YTDlpWrapper.parseVideoInfo).filter(Boolean) as TrackMetadata[];
          }
        }
      }
      return [];
    } catch (error) {
      const e = error as any;
      console.error('Failed to get playlist info:', e?.message || e);
      if (e?.stdout) console.error('[yt-dlp stdout]', e.stdout.toString().slice(0, 2000));
      if (e?.stderr) console.error('[yt-dlp stderr]', e.stderr.toString().slice(0, 2000));
      return [];
    }
  }

  /**
   * Check if URL is a playlist
   */
  static async isPlaylist(url: string): Promise<boolean> {
    try {
      const normalized = YTDlpWrapper.normalizeUrl(url);
      const result: any = await youtubedl(normalized, {
        dumpSingleJson: true,
        skipDownload: true,
        yesPlaylist: true,
        flatPlaylist: true,
        playlistItems: '1',
        noWarnings: true,
        ignoreErrors: true,
      });

      // Accept multiple shapes signifying a playlist
      if (typeof result === 'string') {
        // If we got at least one JSON line, consider it a playlist
        const hasJsonLine = result.split(/\r?\n/).some(l => l.trim().startsWith('{'));
        if (hasJsonLine) return true;
      }
      if (result && typeof result === 'object') {
        if (result._type === 'playlist') return true;
        if (Array.isArray(result.entries) && result.entries.length >= 1) return true;
        if (typeof result.playlist === 'string' || typeof result.playlist_id === 'string') return true;
      }
      // Fallback: array with >=1 items
      if (Array.isArray(result) && result.length >= 1) return true;
      return false;
    } catch (error) {
      const e = error as any;
      console.error('isPlaylist check failed:', e?.message || e);
      if (e?.stdout) console.error('[yt-dlp stdout]', e.stdout.toString().slice(0, 1000));
      if (e?.stderr) console.error('[yt-dlp stderr]', e.stderr.toString().slice(0, 1000));
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

  // Extract a percentage from yt-dlp progress lines.
  // Supports our custom template: "PROGRESS:12.3%" and default lines: "[download]  12.3% of ..."
  private static parseProgressPercent(text: string): number | null {
    let m = text.match(/PROGRESS:\s*(\d{1,3}(?:\.\d+)?)%/);
    if (!m) {
      m = text.match(/\[download\]\s+(\d{1,3}(?:\.\d+)?)%/);
    }
    if (!m) return null;
    const val = parseFloat(m[1]);
    if (Number.isNaN(val)) return null;
    return Math.max(0, Math.min(100, val));
  }
}

// Export default instance
export default YTDlpWrapper;
