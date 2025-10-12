import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DownloadService } from '../services/download.service';
import { PrismaClient } from '@prisma/client';
import { DownloadOptions } from '../types/api.types';
/// <reference path="../types/fastify.d.ts" />

/**
 * Download routes for the 9layer backend
 */
export async function downloadRoutes(fastify: FastifyInstance): Promise<void> {
  // Get the Prisma client and DownloadService from the app
  const prisma = fastify.prisma as PrismaClient;
  const downloadService = new DownloadService(prisma);

  /**
   * Download audio from YouTube URL
   * POST /download/audio
   */
  fastify.post('/download/audio', {
    schema: {
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri' },
          quality: { type: 'string', enum: ['best', 'good', 'medium', 'worst'] },
          format: { type: 'string', enum: ['audio', 'video'] },
          outputDir: { type: 'string' },
          filenameTemplate: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            jobId: { type: 'string' },
            trackId: { type: 'string' },
            filePath: { type: 'string' },
            metadata: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                artist: { type: 'string' },
                album: { type: 'string' },
                duration: { type: 'number' },
                youtubeId: { type: 'string' }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { url, quality = 'best', format = 'audio', outputDir, filenameTemplate } = request.body as {
        url: string;
        quality?: DownloadOptions['quality'];
        format?: DownloadOptions['format'];
        outputDir?: string;
        filenameTemplate?: string;
      };

      if (!url) {
        return reply.code(400).send({
          success: false,
          error: 'URL is required'
        });
      }

      const downloadOptions: DownloadOptions = {
        url,
        quality,
        format,
        ...(outputDir && { outputDir }),
        ...(filenameTemplate && { filenameTemplate }),
        extractMetadata: true
      };

      const result = await downloadService.downloadAudio(url, downloadOptions);

      if (result.success) {
        return reply.send(result);
      } else {
        return reply.code(500).send({
          success: false,
          error: result.error || 'Download failed'
        });
      }
    } catch (error) {
      console.error('Download audio error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Stream download events via Server-Sent Events (SSE)
   * GET /download/stream
   */
  fastify.get('/download/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    // Set SSE headers
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('Access-Control-Allow-Origin', '*');
    // @ts-ignore
    if ((reply.raw as any).flushHeaders) (reply.raw as any).flushHeaders();

    const send = (event: any) => {
      try {
        reply.raw.write(`event: download\n`);
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch {
        cleanup();
      }
    };

    const onEvent = (evt: any) => send(evt);

    const cleanup = () => {
      try { downloadService.off('download', onEvent as any); } catch {}
      try { reply.raw.end(); } catch {}
    };

    // Subscribe to DownloadService "download" events
    downloadService.on('download', onEvent as any);

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      try { reply.raw.write(': keep-alive\n\n'); } catch { cleanup(); }
    }, 25000);

    request.raw.on('close', () => {
      clearInterval(heartbeat);
      cleanup();
    });
  });

  /**
   * Download playlist from YouTube URL
   * POST /download/playlist
   */
  fastify.post('/download/playlist', {
    schema: {
      body: {
        type: 'object',
        required: ['url'],
        properties: {
          url: { type: 'string', format: 'uri' },
          quality: { type: 'string', enum: ['best', 'good', 'medium', 'worst'] },
          format: { type: 'string', enum: ['audio', 'video'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            tracksQueued: { type: 'number' },
            jobs: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  jobId: { type: 'string' },
                  title: { type: 'string' },
                  artist: { type: 'string' },
                  album: { type: 'string' },
                  youtubeId: { type: 'string' }
                }
              }
            }
          }
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        },
        500: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { url, quality = 'best', format = 'audio' } = request.body as {
        url: string;
        quality?: DownloadOptions['quality'];
        format?: DownloadOptions['format'];
      };

      if (!url) {
        return reply.code(400).send({
          success: false,
          error: 'URL is required'
        });
      }

      // Check if URL is actually a playlist
      const YTDlpWrapper = (await import('../utils/yt-dlp')).default;
      const isPlaylist = await YTDlpWrapper.isPlaylist(url);

      if (!isPlaylist) {
        return reply.code(400).send({
          success: false,
          error: 'URL is not a playlist'
        });
      }

      // Get playlist info
      const playlistInfo = await YTDlpWrapper.getPlaylistInfo(url);

      if (playlistInfo.length === 0) {
        return reply.code(400).send({
          success: false,
          error: 'Could not extract playlist information'
        });
      }

      // Extract album name with better fallback logic
      // Try: playlist metadata album -> playlist title -> playlist ID from URL -> fallback
      const sanitizeAlbumName = (name?: string | null): string | undefined => {
        if (typeof name !== 'string') return undefined;
        const normalized = name.replace(/\u00A0/g, ' ').trim();
        if (!normalized) return undefined;
        const lower = normalized.toLowerCase();
        if (lower === 'unknown album') return undefined;
        if (lower === 'topic') return undefined;
        if (lower.startsWith('playlist ')) return undefined;
        if (/^ol[a-z0-9_\-]{8,}$/i.test(lower.replace(/[^a-z0-9]/g, ''))) return undefined;
        if (/^uploads from /.test(lower)) return undefined;
        if (/^mix - /.test(lower)) return undefined;
        return normalized;
      };

      let albumName = sanitizeAlbumName(playlistInfo[0]?.album);
      let playlistMetadata: { title?: string; description?: string; uploader?: string } | null = null;

      if (!albumName) {
        try {
          playlistMetadata = await YTDlpWrapper.getPlaylistMetadata(url);
        } catch (e) {
          console.log('Could not extract playlist title:', e);
        }
        if (!albumName && playlistMetadata?.title) {
          albumName = sanitizeAlbumName(playlistMetadata.title);
        }
        if (!albumName && playlistMetadata?.uploader) {
          albumName = sanitizeAlbumName(playlistMetadata.uploader);
        }
      }

      if (!albumName) {
        albumName = 'Unknown Album';
      }

      console.log(`[PLAYLIST] Detected album name: "${albumName}" for ${playlistInfo.length} tracks`);

      const playlistKey = albumName;
      downloadService.startPlaylistTracking(playlistKey, albumName, playlistInfo.length);

      // Queue downloads for each track in the playlist
      let queuedCount = 0;
      const jobs: Array<{ jobId: string; title?: string; artist?: string; album?: string; youtubeId?: string }> = [];
      for (const track of playlistInfo) {
        try {
          const sanitizedTrackAlbum = sanitizeAlbumName(track.album);
          const computedAlbumOverride = albumName !== 'Unknown Album'
            ? albumName
            : sanitizedTrackAlbum;

          const downloadOptions: DownloadOptions = {
            url: `https://www.youtube.com/watch?v=${track.youtubeId}`,
            quality,
            format,
            extractMetadata: true,
            ...(computedAlbumOverride ? { albumOverride: computedAlbumOverride } : {}),
          };

          const res = await downloadService.downloadAudio(downloadOptions.url, downloadOptions);
          if (res.success && res.jobId) {
            const job: { jobId: string; title?: string; artist?: string; album?: string; youtubeId?: string } = { jobId: res.jobId };
            if (track.title) job.title = track.title;
            if (track.artist) job.artist = track.artist;
            if (sanitizedTrackAlbum) job.album = sanitizedTrackAlbum;
            if (track.youtubeId) job.youtubeId = track.youtubeId;
            jobs.push(job);
          }
          queuedCount++;
        } catch (error) {
          console.error(`Failed to queue track ${track.youtubeId}:`, error);
        }
      }

      return reply.send({
        success: true,
        message: `Queued ${queuedCount} tracks for download`,
        tracksQueued: queuedCount,
        jobs,
      });
    } catch (error) {
      console.error('Download playlist error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Get download progress
   * GET /download/progress/:jobId
   */
  fastify.get('/download/progress/:jobId', {
    schema: {
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            jobId: { type: 'string' },
            status: { type: 'string' },
            progress: { type: 'number' },
            currentSpeed: { type: 'string' },
            eta: { type: 'string' },
            downloadedBytes: { type: 'number' },
            totalBytes: { type: 'number' },
            title: { type: 'string' },
            artist: { type: 'string' },
            album: { type: 'string' },
            youtubeId: { type: 'string' },
            errorMessage: { type: 'string' },
            errorCode: { type: 'string' },
            stallDetected: { type: 'boolean' },
            stallSecondsRemaining: { type: 'number' }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { jobId } = request.params as { jobId: string };

      const progress = await downloadService.getDownloadProgress(jobId);

      if (!progress) {
        return reply.code(404).send({
          success: false,
          error: `Download job ${jobId} not found`
        });
      }

      return reply.send({
        success: true,
        ...progress
      });
    } catch (error) {
      console.error('Get download progress error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Retry download job
   * POST /download/retry/:jobId
   */
  fastify.post('/download/retry/:jobId', {
    schema: {
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            jobId: { type: 'string' },
            previousJobId: { type: 'string' },
            error: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { jobId } = request.params as { jobId: string };

      const result = await downloadService.retryDownload(jobId);
      if (!result.success && result.error?.includes('not found')) {
        return reply.code(404).send({
          success: false,
          error: result.error,
        });
      }

      return reply.send({
        success: result.success,
        jobId: result.jobId,
        previousJobId: result.previousJobId,
        error: result.error,
      });
    } catch (error) {
      console.error('Retry download error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error',
      });
    }
  });

  /**
   * Cancel download
   * DELETE /download/progress/:jobId
   */
  fastify.delete('/download/progress/:jobId', {
    schema: {
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { jobId } = request.params as { jobId: string };

      const cancelled = await downloadService.cancelDownload(jobId);

      if (!cancelled) {
        return reply.code(404).send({
          success: false,
          error: `Download job ${jobId} not found`
        });
      }

      return reply.send({
        success: true,
        message: `Download job ${jobId} cancelled`
      });
    } catch (error) {
      console.error('Cancel download error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Get download queue status
   * GET /download/queue
   */
  fastify.get('/download/queue', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            pending: { type: 'number' },
            active: { type: 'number' },
            total: { type: 'number' }
          }
        }
      }
    }
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const status = downloadService.getQueueStatus();

      return reply.send({
        success: true,
        ...status
      });
    } catch (error) {
      console.error('Get queue status error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });
}
