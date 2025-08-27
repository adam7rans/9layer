import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PlaybackService } from '../services/playback.service';
import { PrismaClient } from '@prisma/client';
import { Track } from '../types/api.types';
/// <reference path="../types/fastify.d.ts" />

/**
 * Playback routes for the 9layer backend
 */
export async function playbackRoutes(fastify: FastifyInstance): Promise<void> {
  // Get the Prisma client and PlaybackService from the app
  const prisma = fastify.prisma as PrismaClient;
  const playbackService = new PlaybackService(prisma);

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
      const formattedTracks: Track[] = tracks.map(track => ({
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
        createdAt: track.createdAt,
        updatedAt: track.updatedAt
      }));

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
                    artistId: { type: 'string' },
                    albumId: { type: 'string' },
                    duration: { type: 'number' }
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
                      title: { type: 'string' }
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

      return reply.send({
        success: true,
        state: {
          currentTrack: state.currentTrack ? {
            id: state.currentTrack.id,
            title: state.currentTrack.title,
            artistId: state.currentTrack.artistId,
            albumId: state.currentTrack.albumId,
            duration: state.currentTrack.duration
          } : null,
          isPlaying: state.isPlaying,
          position: state.position,
          volume: state.volume,
          queue: state.queue.map(track => ({
            id: track.id,
            title: track.title
          })),
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
}
