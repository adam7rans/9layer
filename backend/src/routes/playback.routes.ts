import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PlaybackService } from '../services/playback.service';
import { SearchService } from '../services/search.service';
import { PrismaClient, Prisma } from '@prisma/client';
import { Track } from '../types/api.types';
import * as fs from 'fs';
import * as path from 'path';
/// <reference path="../types/fastify.d.ts" />

/**
 * Playback routes for the 9layer backend
 */
export async function playbackRoutes(fastify: FastifyInstance): Promise<void> {
  // Get the Prisma client and initialize services
  const prisma = fastify.prisma as PrismaClient;
  const playbackService = new PlaybackService(prisma);
  const searchService = new SearchService(prisma);

  // Small helper to determine content-type by file extension
  function contentTypeFor(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    switch (ext) {
      case '.mp3':
        return 'audio/mpeg';
      case '.m4a':
        // m4a is MPEG-4 audio
        return 'audio/mp4';
      case '.webm':
        return 'audio/webm';
      case '.ogg':
        return 'audio/ogg';
      case '.opus':
        // standalone .opus is typically served as audio/ogg
        return 'audio/ogg';
      case '.wav':
        return 'audio/wav';
      case '.flac':
        return 'audio/flac';
      default:
        return 'audio/mpeg';
    }
  }

  /**
   * Search across all content types
   * GET /search/all
   */
  fastify.get('/search/all', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          q: { type: 'string' },
          artistLimit: { type: 'integer', minimum: 1, maximum: 500, default: 10 },
          albumLimit: { type: 'integer', minimum: 1, maximum: 2000, default: 15 },
          trackLimit: { type: 'integer', minimum: 1, maximum: 5000, default: 25 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            results: {
              type: 'object',
              properties: {
                artists: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      trackCount: { type: 'number' },
                      albumCount: { type: 'number' }
                    }
                  }
                },
                albums: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      artistId: { type: 'string' },
                      artistName: { type: 'string' },
                      trackCount: { type: 'number' },
                      albumType: { type: 'string' },
                      coverUrl: { type: 'string' }
                    }
                  }
                },
                tracks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      artist: { type: 'string' },
                      album: { type: 'string' },
                      artistId: { type: 'string' },
                      albumId: { type: 'string' },
                      duration: { type: 'number' },
                      filePath: { type: 'string' },
                      fileSize: { type: 'number' },
                      youtubeId: { type: 'string' },
                      likeability: { type: 'number' }
                    }
                  }
                },
                totalArtists: { type: 'number' },
                totalAlbums: { type: 'number' },
                totalTracks: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { q = '', artistLimit = 10, albumLimit = 15, trackLimit = 25 } = request.query as any;

      const results = await searchService.searchAll({
        query: q,
        artistLimit,
        albumLimit,
        trackLimit
      });

      return reply.send({
        success: true,
        results
      });
    } catch (error) {
      console.error('Search all error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Get tracks for a specific artist
   * GET /search/artist/:artistId/tracks
   */
  fastify.get('/search/artist/:artistId/tracks', {
    schema: {
      params: {
        type: 'object',
        required: ['artistId'],
        properties: {
          artistId: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            tracks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  artist: { type: 'string' },
                  album: { type: 'string' },
                  artistId: { type: 'string' },
                  albumId: { type: 'string' },
                  duration: { type: 'number' },
                  filePath: { type: 'string' },
                  fileSize: { type: 'number' },
                  youtubeId: { type: 'string' },
                  likeability: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { artistId } = request.params as { artistId: string };
      const { limit = 50 } = request.query as any;

      const tracks = await searchService.getArtistTracks(artistId, limit);

      return reply.send({
        success: true,
        tracks
      });
    } catch (error) {
      console.error('Get artist tracks error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Get tracks for a specific album
   * GET /search/album/:albumId/tracks
   */
  fastify.get('/search/album/:albumId/tracks', {
    schema: {
      params: {
        type: 'object',
        required: ['albumId'],
        properties: {
          albumId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            tracks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  artist: { type: 'string' },
                  album: { type: 'string' },
                  artistId: { type: 'string' },
                  albumId: { type: 'string' },
                  duration: { type: 'number' },
                  filePath: { type: 'string' },
                  fileSize: { type: 'number' },
                  youtubeId: { type: 'string' },
                  likeability: { type: 'number' }
                }
              }
            }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { albumId } = request.params as { albumId: string };

      const tracks = await searchService.getAlbumTracks(albumId);

      return reply.send({
        success: true,
        tracks
      });
    } catch (error) {
      console.error('Get album tracks error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Get all tracks
   * GET /tracks
   */
  fastify.get('/tracks', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
          offset: { type: 'integer', minimum: 0, default: 0 },
          search: { type: 'string' },
          artist: { type: 'string' },
          album: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            tracks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  title: { type: 'string' },
                  artist: { type: 'string' },
                  album: { type: 'string' },
                  artistId: { type: 'string' },
                  albumId: { type: 'string' },
                  duration: { type: 'number' },
                  filePath: { type: 'string' },
                  fileSize: { type: 'number' },
                  youtubeId: { type: 'string' },
                  likeability: { type: 'number' }
                }
              }
            },
            total: { type: 'integer' },
            hasMore: { type: 'boolean' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { limit = 50, offset = 0, search, artist, album } = request.query as any;

      // Build where clause
      const where: any = {};

      if (search) {
        where.OR = [
          {
            title: {
              contains: search,
              mode: 'insensitive'
            }
          },
          {
            artist: {
              name: {
                contains: search,
                mode: 'insensitive'
              }
            }
          },
          {
            album: {
              title: {
                contains: search,
                mode: 'insensitive'
              }
            }
          }
        ];
      }

      if (artist) {
        where.artist = {
          name: {
            contains: artist,
            mode: 'insensitive'
          }
        };
      }

      if (album) {
        where.album = {
          title: {
            contains: album,
            mode: 'insensitive'
          }
        };
      }

      // Get tracks with artist and album information
      const [tracks, total] = await Promise.all([
        prisma.track.findMany({
          where,
          include: {
            artist: true,
            album: true
          },
          orderBy: [
            { artist: { name: 'asc' } },
            { album: { title: 'asc' } },
            { title: 'asc' }
          ],
          skip: offset,
          take: limit
        }),
        prisma.track.count({ where })
      ]);

      // Convert to Track format with artist and album names
      const formattedTracks: Track[] = tracks.map(track => {
        const dbTrack = track as { incorrectMatch?: boolean | null; incorrectFlaggedAt?: Date | null };
        return {
          id: track.id,
          title: track.title,
          artist: track.artist?.name || 'Unknown Artist',
          album: track.album?.title || 'Unknown Album',
          artistId: track.artistId,
          albumId: track.albumId,
          duration: track.duration,
          filePath: track.filePath,
          fileSize: track.fileSize,
          youtubeId: track.youtubeId ?? undefined,
          likeability: track.likeability,
          incorrectMatch: dbTrack.incorrectMatch ?? false,
          incorrectFlaggedAt: dbTrack.incorrectFlaggedAt ?? null,
          createdAt: track.createdAt,
          updatedAt: track.updatedAt
        };
      });

      return reply.send({
        success: true,
        tracks: formattedTracks,
        total,
        hasMore: offset + limit < total
      });
    } catch (error) {
      console.error('Get tracks error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Flag track as incorrect match
   * POST /tracks/:trackId/incorrect
   */
  fastify.post('/tracks/:trackId/incorrect', {
    schema: {
      params: {
        type: 'object',
        required: ['trackId'],
        properties: {
          trackId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
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
      const { trackId } = request.params as { trackId: string };

      const track = await prisma.track.findUnique({ where: { id: trackId } });
      if (!track) {
        return reply.code(404).send({ success: false, error: 'Track not found' });
      }

      const updateData = {
        incorrectMatch: { set: true },
        incorrectFlaggedAt: { set: new Date() }
      } as Prisma.TrackUpdateInput;

      await prisma.track.update({
        where: { id: trackId },
        data: updateData
      });

      const updatedTrack = await prisma.track.findUnique({
        where: { id: trackId },
        select: {
          id: true,
          title: true,
          incorrectMatch: true,
          incorrectFlaggedAt: true
        }
      });

      await playbackService.refreshTrack(trackId);

      console.log('[FLAG] Track marked incorrect', {
        trackId,
        title: updatedTrack?.title,
        incorrectMatch: updatedTrack?.incorrectMatch,
        incorrectFlaggedAt: updatedTrack?.incorrectFlaggedAt,
      });

      return reply.send({ success: true });
    } catch (error) {
      console.error('Flag incorrect track error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Clear incorrect match flag
   * DELETE /tracks/:trackId/incorrect
   */
  fastify.delete('/tracks/:trackId/incorrect', {
    schema: {
      params: {
        type: 'object',
        required: ['trackId'],
        properties: {
          trackId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' }
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
      const { trackId } = request.params as { trackId: string };

      const track = await prisma.track.findUnique({ where: { id: trackId } });
      if (!track) {
        return reply.code(404).send({ success: false, error: 'Track not found' });
      }

      const updateData = {
        incorrectMatch: { set: false },
        incorrectFlaggedAt: { set: null }
      } as Prisma.TrackUpdateInput;

      await prisma.track.update({
        where: { id: trackId },
        data: updateData
      });

      const updatedTrack = await prisma.track.findUnique({
        where: { id: trackId },
        select: {
          id: true,
          title: true,
          incorrectMatch: true,
          incorrectFlaggedAt: true
        }
      });

      await playbackService.refreshTrack(trackId);

      console.log('[FLAG] Track flag cleared', {
        trackId,
        title: updatedTrack?.title,
        incorrectMatch: updatedTrack?.incorrectMatch,
        incorrectFlaggedAt: updatedTrack?.incorrectFlaggedAt,
      });

      return reply.send({ success: true });
    } catch (error) {
      console.error('Clear incorrect track flag error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Get a single random track
   * GET /tracks/random
   */
  fastify.get('/tracks/random', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            track: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                artist: { type: 'string' },
                album: { type: 'string' },
                artistId: { type: 'string' },
                albumId: { type: 'string' },
                duration: { type: 'number' },
                filePath: { type: 'string' },
                fileSize: { type: 'number' },
                youtubeId: { type: 'string' },
                likeability: { type: 'number' }
              }
            }
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
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const total = await prisma.track.count();
      if (total === 0) {
        return reply.code(404).send({ success: false, error: 'No tracks available' });
      }

      const skip = Math.floor(Math.random() * total);
      const results = await prisma.track.findMany({
        include: { artist: true, album: true },
        skip,
        take: 1,
        orderBy: { id: 'asc' }
      });

      const t = results[0];
      const dbTrack = t as { incorrectMatch?: boolean | null; incorrectFlaggedAt?: Date | null };
      const formatted = {
        id: t.id,
        title: t.title,
        artist: t.artist?.name || 'Unknown Artist',
        album: t.album?.title || 'Unknown Album',
        artistId: t.artistId,
        albumId: t.albumId,
        duration: t.duration,
        filePath: t.filePath,
        fileSize: t.fileSize,
        youtubeId: t.youtubeId ?? undefined,
        likeability: t.likeability,
        incorrectMatch: dbTrack.incorrectMatch ?? false,
        incorrectFlaggedAt: dbTrack.incorrectFlaggedAt ?? null,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt
      };

      return reply.send({ success: true, track: formatted });
    } catch (error) {
      console.error('Get random track error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  fastify.post('/playback/play/:trackId', {
    schema: {
      params: {
        type: 'object',
        required: ['trackId'],
        properties: {
          trackId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            track: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                artistId: { type: 'string' },
                albumId: { type: 'string' },
                duration: { type: 'number' }
              }
            }
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
      const { trackId } = request.params as { trackId: string };

      const trackRecord = await prisma.track.findUnique({ where: { id: trackId } });

      if (!trackRecord) {
        return reply.code(404).send({
          success: false,
          error: 'Track not found'
        });
      }

      if (!trackRecord.filePath) {
        console.warn('[playback] Track has no file path', { trackId });
        return reply.code(404).send({
          success: false,
          error: 'Track is missing its audio file path',
          trackId
        });
      }

      if (!fs.existsSync(trackRecord.filePath)) {
        console.warn('[playback] File missing on disk', { trackId, filePath: trackRecord.filePath });
        return reply.code(404).send({
          success: false,
          error: 'Audio file not found on disk',
          trackId,
          filePath: trackRecord.filePath
        });
      }

      await playbackService.startPlayback(trackId);

      const track = await playbackService.getTrackById(trackId);

      return reply.send({
        success: true,
        message: `Started playback of ${track?.title || 'track'}`,
        track: track ? {
          id: track.id,
          title: track.title,
          artistId: track.artistId,
          albumId: track.albumId,
          duration: track.duration
        } : null
      });
    } catch (error) {
      console.error('Play track error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Pause playback
   * POST /playback/pause
   */
  fastify.post('/playback/pause', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await playbackService.pausePlayback();

      return reply.send({
        success: true,
        message: 'Playback paused'
      });
    } catch (error) {
      console.error('Pause playback error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Resume playback
   * POST /playback/resume
   */
  fastify.post('/playback/resume', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await playbackService.resumePlayback();

      return reply.send({
        success: true,
        message: 'Playback resumed'
      });
    } catch (error) {
      console.error('Resume playback error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Stop playback
   * POST /playback/stop
   */
  fastify.post('/playback/stop', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await playbackService.stopPlayback();

      return reply.send({
        success: true,
        message: 'Playback stopped'
      });
    } catch (error) {
      console.error('Stop playback error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Play next track
   * POST /playback/next
   */
  fastify.post('/playback/next', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await playbackService.playNext();

      return reply.send({
        success: true,
        message: 'Playing next track'
      });
    } catch (error) {
      console.error('Play next error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Play previous track
   * POST /playback/previous
   */
  fastify.post('/playback/previous', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await playbackService.playPrevious();

      return reply.send({
        success: true,
        message: 'Playing previous track'
      });
    } catch (error) {
      console.error('Play previous error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Seek to position
   * POST /playback/seek
   */
  fastify.post('/playback/seek', {
    schema: {
      body: {
        type: 'object',
        required: ['position'],
        properties: {
          position: { type: 'number', minimum: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { position } = request.body as { position: number };

      await playbackService.seekTo(position);

      return reply.send({
        success: true,
        message: `Seeked to position ${position}s`
      });
    } catch (error) {
      console.error('Seek error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Set volume
   * POST /playback/volume
   */
  fastify.post('/playback/volume', {
    schema: {
      body: {
        type: 'object',
        required: ['volume'],
        properties: {
          volume: { type: 'number', minimum: 0, maximum: 100 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { volume } = request.body as { volume: number };

      await playbackService.setVolume(volume);

      return reply.send({
        success: true,
        message: `Volume set to ${volume}%`
      });
    } catch (error) {
      console.error('Set volume error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Add track to queue
   * POST /playback/queue/add/:trackId
   */
  fastify.post('/playback/queue/add/:trackId', {
    schema: {
      params: {
        type: 'object',
        required: ['trackId'],
        properties: {
          trackId: { type: 'string' }
        }
      },
      querystring: {
        type: 'object',
        properties: {
          position: { type: 'integer', minimum: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { trackId } = request.params as { trackId: string };
      const position = (request.query as any)?.position ? parseInt((request.query as any).position) : undefined;

      await playbackService.addToQueue(trackId, position);

      return reply.send({
        success: true,
        message: `Track added to queue${position !== undefined ? ` at position ${position}` : ''}`
      });
    } catch (error) {
      console.error('Add to queue error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Remove track from queue
   * DELETE /playback/queue/:position
   */
  fastify.delete('/playback/queue/:position', {
    schema: {
      params: {
        type: 'object',
        required: ['position'],
        properties: {
          position: { type: 'integer', minimum: 0 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { position } = request.params as { position: number };

      await playbackService.removeFromQueue(position);

      return reply.send({
        success: true,
        message: `Removed track at position ${position} from queue`
      });
    } catch (error) {
      console.error('Remove from queue error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Clear queue
   * DELETE /playback/queue
   */
  fastify.delete('/playback/queue', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await playbackService.clearQueue();

      return reply.send({
        success: true,
        message: 'Queue cleared'
      });
    } catch (error) {
      console.error('Clear queue error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Get playback state
   * GET /playback/state
   */
  fastify.get('/playback/state', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            state: {
              type: 'object',
              properties: {
                currentTrack: {
                  type: 'object',
                  nullable: true,
                  properties: {
                    id: { type: 'string' },
                    title: { type: 'string' },
                    artist: { type: 'string' },
                    album: { type: 'string' },
                    artistId: { type: 'string' },
                    albumId: { type: 'string' },
                    duration: { type: 'number' },
                    filePath: { type: 'string' },
                    fileSize: { type: 'number' },
                    youtubeId: { type: 'string' },
                    likeability: { type: 'number' },
                    incorrectMatch: { type: 'boolean' },
                    incorrectFlaggedAt: { type: 'string', nullable: true }
                  }
                },
                isPlaying: { type: 'boolean' },
                position: { type: 'number' },
                volume: { type: 'number' },
                queue: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      artist: { type: 'string' },
                      album: { type: 'string' },
                      incorrectMatch: { type: 'boolean' },
                      incorrectFlaggedAt: { type: 'string', nullable: true }
                    }
                  }
                },
                repeat: { type: 'string' },
                shuffle: { type: 'boolean' }
              }
            }
          }
        }
      }
    }
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const state = playbackService.getPlaybackState();

      // If there's a current track, fetch full track info with artist/album names
      let currentTrackWithNames = null;
      if (state.currentTrack) {
        const fullTrack = await prisma.track.findUnique({
          where: { id: state.currentTrack.id },
          include: {
            artist: true,
            album: true
          }
        });

        if (fullTrack) {
          const dbTrack = fullTrack as { incorrectMatch?: boolean | null; incorrectFlaggedAt?: Date | null };
          currentTrackWithNames = {
            id: fullTrack.id,
            title: fullTrack.title,
            artist: fullTrack.artist?.name || 'Unknown Artist',
            album: fullTrack.album?.title || 'Unknown Album',
            artistId: fullTrack.artistId,
            albumId: fullTrack.albumId,
            duration: fullTrack.duration,
            filePath: fullTrack.filePath,
            fileSize: fullTrack.fileSize,
            youtubeId: fullTrack.youtubeId,
            likeability: fullTrack.likeability,
            incorrectMatch: dbTrack.incorrectMatch ?? false,
            incorrectFlaggedAt: dbTrack.incorrectFlaggedAt ?? null,
          };
        }
      }

      // Get queue with full track info
      const queueWithNames = await Promise.all(
        state.queue.map(async (track) => {
          const fullTrack = await prisma.track.findUnique({
            where: { id: track.id },
            include: {
              artist: true,
              album: true
            }
          });

          const dbTrack = fullTrack as { incorrectMatch?: boolean | null; incorrectFlaggedAt?: Date | null };
          return {
            id: track.id,
            title: track.title,
            artist: fullTrack?.artist?.name || 'Unknown Artist',
            album: fullTrack?.album?.title || 'Unknown Album',
            incorrectMatch: dbTrack?.incorrectMatch ?? false,
            incorrectFlaggedAt: dbTrack?.incorrectFlaggedAt ?? null,
          };
        })
      );

      return reply.send({
        success: true,
        state: {
          currentTrack: currentTrackWithNames,
          isPlaying: state.isPlaying,
          position: state.position,
          volume: state.volume,
          queue: queueWithNames,
          repeat: state.repeat,
          shuffle: state.shuffle
        }
      });
    } catch (error) {
      console.error('Get playback state error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Get playback queue
   * GET /playback/queue
   */
  fastify.get('/playback/queue', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            queue: {
              type: 'object',
              properties: {
                tracks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' }
                    }
                  }
                },
                currentIndex: { type: 'integer' }
              }
            }
          }
        }
      }
    }
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      const queue = playbackService.getPlaybackQueue();

      return reply.send({
        success: true,
        queue: {
          tracks: queue.tracks.map(track => ({
            id: track.id,
            title: track.title
          })),
          currentIndex: queue.currentIndex
        }
      });
    } catch (error) {
      console.error('Get playback queue error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Load playlist as queue
   * POST /playback/playlist/:playlistId
   */
  fastify.post('/playback/playlist/:playlistId', {
    schema: {
      params: {
        type: 'object',
        required: ['playlistId'],
        properties: {
          playlistId: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { playlistId } = request.params as { playlistId: string };

      await playbackService.loadPlaylist(playlistId);

      return reply.send({
        success: true,
        message: 'Playlist loaded as queue'
      });
    } catch (error) {
      console.error('Load playlist error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Toggle shuffle
   * POST /playback/shuffle
   */
  fastify.post('/playback/shuffle', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            shuffle: { type: 'boolean' }
          }
        }
      }
    }
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      await playbackService.toggleShuffle();

      const state = playbackService.getPlaybackState();

      return reply.send({
        success: true,
        message: `Shuffle ${state.shuffle ? 'enabled' : 'disabled'}`,
        shuffle: state.shuffle
      });
    } catch (error) {
      console.error('Toggle shuffle error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Set repeat mode
   * POST /playback/repeat
   */
  fastify.post('/playback/repeat', {
    schema: {
      body: {
        type: 'object',
        required: ['mode'],
        properties: {
          mode: { type: 'string', enum: ['none', 'track', 'queue'] }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            repeat: { type: 'string' }
          }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { mode } = request.body as { mode: 'none' | 'track' | 'queue' };

      await playbackService.setRepeat(mode);

      return reply.send({
        success: true,
        message: `Repeat mode set to ${mode}`,
        repeat: mode
      });
    } catch (error) {
      console.error('Set repeat error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });

  /**
   * Serve audio file for streaming
   * GET /playback/audio/:trackId
   */
  fastify.get('/playback/audio/:trackId', {
    schema: {
      params: {
        type: 'object',
        required: ['trackId'],
        properties: {
          trackId: { type: 'string' }
        }
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { trackId } = request.params as { trackId: string };
      
      // Get track from database to get file path
      const track = await prisma.track.findUnique({
        where: { id: trackId }
      });

      if (!track) {
        console.warn('[audio] 404: track not found', { trackId });
        return reply.code(404).send({
          success: false,
          error: 'Track not found',
          trackId
        });
      }

      if (!track.filePath) {
        console.warn('[audio] 404: track has empty filePath', { trackId });
        return reply.code(404).send({
          success: false,
          error: 'Track has no file path',
          trackId
        });
      }

      const filePath = track.filePath;

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        console.warn('[audio] 404: file missing on disk', { trackId, filePath });
        return reply.code(404).send({
          success: false,
          error: 'Audio file not found on disk',
          trackId,
          filePath
        });
      }

      // Get file stats for content length
      const stat = fs.statSync(filePath);
      const fileSize = stat.size;

      // Handle range requests for audio streaming
      const range = request.headers.range;
      
      if (range) {
        // Parse range header
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
        const chunksize = (end - start) + 1;

        // Create read stream for the requested range
        const file = fs.createReadStream(filePath, { start, end });

        // Set appropriate headers for partial content
        reply.code(206);
        reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Content-Length', chunksize);
        // Determine content type based on file extension
        reply.header('Content-Type', contentTypeFor(filePath));
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Range');
        
        return reply.send(file);
      } else {
        // Serve entire file
        const file = fs.createReadStream(filePath);
        
        reply.header('Content-Length', fileSize);
        // Determine content type based on file extension
        reply.header('Content-Type', contentTypeFor(filePath));
        reply.header('Accept-Ranges', 'bytes');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        reply.header('Access-Control-Allow-Headers', 'Range');
        
        return reply.send(file);
      }
    } catch (error) {
      console.error('Audio serving error:', error);
      return reply.code(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Internal server error'
      });
    }
  });
}
