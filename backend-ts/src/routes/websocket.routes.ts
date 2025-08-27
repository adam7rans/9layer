import { FastifyInstance } from 'fastify';
import WebSocketService from '../services/websocket.service';
import { PlaybackService } from '../services/playback.service';
import { PrismaClient } from '@prisma/client';
/// <reference path="../types/fastify.d.ts" />

/**
 * WebSocket routes for the 9layer backend
 * Handles real-time communication for playback control
 */
export async function websocketRoutes(fastify: FastifyInstance): Promise<void> {
  // Get services from the app
  const prisma = fastify.prisma as PrismaClient;
  const playbackService = new PlaybackService(prisma);
  const websocketService = new WebSocketService();

  // Initialize WebSocket service with the Fastify server
  websocketService.initialize(fastify.server);

  // Register WebSocket command handlers
  websocketService.registerCommandHandler('play', async (command, clientId) => {
    try {
      if (command.trackId) {
        await playbackService.startPlayback(command.trackId);
        websocketService.sendToClient(clientId, {
          type: 'playback_started',
          payload: { trackId: command.trackId },
          timestamp: new Date()
        });
      }
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Play failed' },
        timestamp: new Date()
      });
    }
  });

  websocketService.registerCommandHandler('pause', async (_command, clientId) => {
    try {
      await playbackService.pausePlayback();
      websocketService.sendToClient(clientId, {
        type: 'playback_paused',
        payload: {},
        timestamp: new Date()
      });
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Pause failed' },
        timestamp: new Date()
      });
    }
  });

  websocketService.registerCommandHandler('resume', async (_command, clientId) => {
    try {
      await playbackService.resumePlayback();
      websocketService.sendToClient(clientId, {
        type: 'playback_resumed',
        payload: {},
        timestamp: new Date()
      });
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Resume failed' },
        timestamp: new Date()
      });
    }
  });

  websocketService.registerCommandHandler('stop', async (_command, clientId) => {
    try {
      await playbackService.stopPlayback();
      websocketService.sendToClient(clientId, {
        type: 'playback_stopped',
        payload: {},
        timestamp: new Date()
      });
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Stop failed' },
        timestamp: new Date()
      });
    }
  });

  websocketService.registerCommandHandler('next', async (_command, clientId) => {
    try {
      await playbackService.playNext();
      websocketService.sendToClient(clientId, {
        type: 'playback_next',
        payload: {},
        timestamp: new Date()
      });
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Next failed' },
        timestamp: new Date()
      });
    }
  });

  websocketService.registerCommandHandler('previous', async (_command, clientId) => {
    try {
      await playbackService.playPrevious();
      websocketService.sendToClient(clientId, {
        type: 'playback_previous',
        payload: {},
        timestamp: new Date()
      });
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Previous failed' },
        timestamp: new Date()
      });
    }
  });

  websocketService.registerCommandHandler('seek', async (command, clientId) => {
    try {
      if (typeof command.position === 'number') {
        await playbackService.seekTo(command.position);
        websocketService.sendToClient(clientId, {
          type: 'playback_seeked',
          payload: { position: command.position },
          timestamp: new Date()
        });
      }
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Seek failed' },
        timestamp: new Date()
      });
    }
  });

  websocketService.registerCommandHandler('setVolume', async (command, clientId) => {
    try {
      if (typeof command.volume === 'number') {
        await playbackService.setVolume(command.volume);
        websocketService.sendToClient(clientId, {
          type: 'volume_changed',
          payload: { volume: command.volume },
          timestamp: new Date()
        });
      }
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Volume change failed' },
        timestamp: new Date()
      });
    }
  });

  websocketService.registerCommandHandler('addToQueue', async (command, clientId) => {
    try {
      if (command.trackId) {
        await playbackService.addToQueue(command.trackId, command.data?.position);
        websocketService.sendToClient(clientId, {
          type: 'queue_updated',
          payload: { action: 'added', trackId: command.trackId },
          timestamp: new Date()
        });
      }
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Add to queue failed' },
        timestamp: new Date()
      });
    }
  });

  websocketService.registerCommandHandler('removeFromQueue', async (command, clientId) => {
    try {
      if (typeof command.data?.position === 'number') {
        await playbackService.removeFromQueue(command.data.position);
        websocketService.sendToClient(clientId, {
          type: 'queue_updated',
          payload: { action: 'removed', position: command.data.position },
          timestamp: new Date()
        });
      }
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Remove from queue failed' },
        timestamp: new Date()
      });
    }
  });

  websocketService.registerCommandHandler('clearQueue', async (_command, clientId) => {
    try {
      await playbackService.clearQueue();
      websocketService.sendToClient(clientId, {
        type: 'queue_cleared',
        payload: {},
        timestamp: new Date()
      });
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Clear queue failed' },
        timestamp: new Date()
      });
    }
  });

  websocketService.registerCommandHandler('getState', async (_command, clientId) => {
    try {
      const state = playbackService.getPlaybackState();
      websocketService.sendToClient(clientId, {
        type: 'playback_state',
        payload: {
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
        },
        timestamp: new Date()
      });
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Get state failed' },
        timestamp: new Date()
      });
    }
  });

  websocketService.registerCommandHandler('toggleShuffle', async (_command, clientId) => {
    try {
      await playbackService.toggleShuffle();
      const state = playbackService.getPlaybackState();
      websocketService.sendToClient(clientId, {
        type: 'shuffle_toggled',
        payload: { shuffle: state.shuffle },
        timestamp: new Date()
      });
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Toggle shuffle failed' },
        timestamp: new Date()
      });
    }
  });

  websocketService.registerCommandHandler('setRepeat', async (command, clientId) => {
    try {
      if (command.data?.mode && ['none', 'track', 'queue'].includes(command.data.mode)) {
        await playbackService.setRepeat(command.data.mode as 'none' | 'track' | 'queue');
        websocketService.sendToClient(clientId, {
          type: 'repeat_changed',
          payload: { repeat: command.data.mode },
          timestamp: new Date()
        });
      }
    } catch (error) {
      websocketService.sendToClient(clientId, {
        type: 'error',
        payload: { message: error instanceof Error ? error.message : 'Set repeat failed' },
        timestamp: new Date()
      });
    }
  });

  // Listen to playback service events and broadcast them
  playbackService.on('playback', (event) => {
    websocketService.broadcast({
      type: `playback_${event.type}`,
      payload: event.data,
      timestamp: new Date()
    });
  });

  playbackService.on('stateChanged', (state) => {
    websocketService.broadcast({
      type: 'playback_state_changed',
      payload: {
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
        queue: state.queue.map((track: any) => ({
          id: track.id,
          title: track.title
        })),
        repeat: state.repeat,
        shuffle: state.shuffle
      },
      timestamp: new Date()
    });
  });

  // Cleanup on app close
  fastify.addHook('onClose', async () => {
    websocketService.shutdown();
  });

  console.log('WebSocket routes initialized');
}
