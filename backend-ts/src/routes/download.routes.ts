import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { DownloadService } from '../services/download.service';
import { PrismaClient } from '@prisma/client';
import { DownloadOptions } from '../types/api.types';
import '../types/fastify';

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
            tracksQueued: { type: 'number' }
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

      // Queue downloads for each track in the playlist
      let queuedCount = 0;
      for (const track of playlistInfo) {
        try {
          const downloadOptions: DownloadOptions = {
            url: `https://www.youtube.com/watch?v=${track.youtubeId}`,
            quality,
            format,
            extractMetadata: true
          };

          await downloadService.downloadAudio(downloadOptions.url, downloadOptions);
          queuedCount++;
        } catch (error) {
          console.error(`Failed to queue track ${track.youtubeId}:`, error);
        }
      }

      return reply.send({
        success: true,
        message: `Queued ${queuedCount} tracks for download`,
        tracksQueued: queuedCount
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
            totalBytes: { type: 'number' }
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
