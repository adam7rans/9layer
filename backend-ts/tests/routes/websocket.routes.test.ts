import { WebSocket, WebSocketServer } from 'ws';
import { FastifyInstance } from 'fastify';
import { TestDatabase } from '../database';
import { TestDataFactory } from '../factory';
import { PrismaClient } from '@prisma/client';
import { jest } from '@jest/globals';

// Mock the playback service
const mockPlaybackService = {
  startPlayback: jest.fn(),
  pausePlayback: jest.fn(),
  resumePlayback: jest.fn(),
  stopPlayback: jest.fn(),
  playNext: jest.fn(),
  playPrevious: jest.fn(),
  seekTo: jest.fn(),
  setVolume: jest.fn(),
  addToQueue: jest.fn(),
  removeFromQueue: jest.fn(),
  clearQueue: jest.fn(),
  getPlaybackState: jest.fn(),
  getPlaybackQueue: jest.fn(),
  toggleShuffle: jest.fn() as jest.MockedFunction<() => Promise<void>>,
  setRepeat: jest.fn() as jest.MockedFunction<(mode: string) => Promise<void>>,
  on: jest.fn(),
  emit: jest.fn(),
};

// Mock the services
jest.mock('../../src/services/playback.service', () => ({
  PlaybackService: jest.fn().mockImplementation(() => mockPlaybackService),
}));

jest.mock('../../src/services/websocket.service', () => ({
  WebSocketService: jest.fn().mockImplementation(() => ({
    initialize: jest.fn(),
    registerCommandHandler: jest.fn(),
    sendToClient: jest.fn(),
    broadcast: jest.fn(),
    getClientInfo: jest.fn(),
    getConnectedClients: jest.fn(),
    disconnectClient: jest.fn(),
    disconnectAll: jest.fn(),
    getConnectionStats: jest.fn(),
    shutdown: jest.fn(),
  })),
}));

describe('WebSocket Integration Tests', () => {
  let app: FastifyInstance;
  let server: any;
  let wss: WebSocketServer;
  let mockTrack: any;

  beforeAll(async () => {
    const prisma = await TestDatabase.setup();

    // Create test data
    mockTrack = TestDataFactory.createTrack();
    await prisma.artist.create({
      data: {
        id: mockTrack.artistId,
        name: 'Test Artist',
      }
    });
    await prisma.album.create({
      data: {
        id: mockTrack.albumId,
        title: 'Test Album',
        artistId: mockTrack.artistId,
      }
    });
    await prisma.track.create({
      data: {
        id: mockTrack.id,
        title: mockTrack.title,
        artistId: mockTrack.artistId,
        albumId: mockTrack.albumId,
        duration: mockTrack.duration,
        filePath: mockTrack.filePath,
        fileSize: mockTrack.fileSize,
        youtubeId: mockTrack.youtubeId,
        likeability: mockTrack.likeability,
      }
    });
  });

  afterAll(async () => {
    await TestDatabase.teardown();
  });

  beforeEach(async () => {
    await TestDatabase.clean();
    jest.clearAllMocks();

    // Import and create app after mocks are set up
    const { createApp } = await import('../test-app');
    app = await createApp();
    await app.ready();

    server = app.server;
    wss = new WebSocketServer({ server });
  });

  afterEach(async () => {
    wss.close();
    await app.close();
  });

  describe('WebSocket Connection', () => {
    it('should establish WebSocket connection', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        ws.close();
        done();
      });

      ws.on('error', (error) => {
        done.fail(`WebSocket connection failed: ${error.message}`);
      });
    });

    it('should handle connection with user agent', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws', {
        headers: {
          'User-Agent': 'Test-Agent/1.0',
        },
      });

      ws.on('open', () => {
        ws.close();
        done();
      });

      ws.on('error', (error) => {
        done.fail(`Connection failed: ${error.message}`);
      });
    });
  });

  describe('Command Handling', () => {
    it('should handle play command', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'play',
            trackId: mockTrack.id,
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(mockPlaybackService.startPlayback).toHaveBeenCalledWith(mockTrack.id);
        ws.close();
        done();
      });

      ws.on('error', (error) => {
        done.fail(`Command handling failed: ${error.message}`);
      });
    });

    it('should handle pause command', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'pause',
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(mockPlaybackService.pausePlayback).toHaveBeenCalled();
        ws.close();
        done();
      });
    });

    it('should handle resume command', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'resume',
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(mockPlaybackService.resumePlayback).toHaveBeenCalled();
        ws.close();
        done();
      });
    });

    it('should handle stop command', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'stop',
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(mockPlaybackService.stopPlayback).toHaveBeenCalled();
        ws.close();
        done();
      });
    });

    it('should handle next command', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'next',
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(mockPlaybackService.playNext).toHaveBeenCalled();
        ws.close();
        done();
      });
    });

    it('should handle previous command', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'previous',
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(mockPlaybackService.playPrevious).toHaveBeenCalled();
        ws.close();
        done();
      });
    });

    it('should handle seek command', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'seek',
            position: 60,
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(mockPlaybackService.seekTo).toHaveBeenCalledWith(60);
        ws.close();
        done();
      });
    });

    it('should handle setVolume command', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'setVolume',
            volume: 75,
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(mockPlaybackService.setVolume).toHaveBeenCalledWith(75);
        ws.close();
        done();
      });
    });

    it('should handle addToQueue command', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'addToQueue',
            trackId: mockTrack.id,
            position: 1,
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(mockPlaybackService.addToQueue).toHaveBeenCalledWith(mockTrack.id, 1);
        ws.close();
        done();
      });
    });

    it('should handle removeFromQueue command', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'removeFromQueue',
            position: 2,
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(mockPlaybackService.removeFromQueue).toHaveBeenCalledWith(2);
        ws.close();
        done();
      });
    });

    it('should handle clearQueue command', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'clearQueue',
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(mockPlaybackService.clearQueue).toHaveBeenCalled();
        ws.close();
        done();
      });
    });

    it('should handle getState command', (done) => {
      const mockState = {
        currentTrack: mockTrack,
        isPlaying: true,
        position: 45,
        volume: 80,
        queue: [mockTrack],
        repeat: 'none',
        shuffle: false,
      };

      mockPlaybackService.getPlaybackState.mockReturnValue(mockState);

      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'getState',
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(response.payload.state.currentTrack.id).toBe(mockTrack.id);
        expect(mockPlaybackService.getPlaybackState).toHaveBeenCalled();
        ws.close();
        done();
      });
    });

    it('should handle toggleShuffle command', (done) => {
      mockPlaybackService.toggleShuffle.mockResolvedValue(undefined);
      mockPlaybackService.getPlaybackState.mockReturnValue({
        currentTrack: null,
        isPlaying: false,
        position: 0,
        volume: 100,
        queue: [],
        repeat: 'none',
        shuffle: true,
      });

      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'toggleShuffle',
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(mockPlaybackService.toggleShuffle).toHaveBeenCalled();
        ws.close();
        done();
      });
    });

    it('should handle setRepeat command', (done) => {
      mockPlaybackService.setRepeat.mockResolvedValue(undefined);

      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'setRepeat',
            mode: 'track',
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('response');
        expect(response.success).toBe(true);
        expect(mockPlaybackService.setRepeat).toHaveBeenCalledWith('track');
        ws.close();
        done();
      });
    });
  });

  describe('Unknown Commands', () => {
    it('should handle unknown commands', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        const command = {
          type: 'command',
          payload: {
            action: 'unknownCommand',
          },
          timestamp: new Date(),
        };

        ws.send(JSON.stringify(command));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('error');
        expect(response.error).toContain('Unknown command');
        ws.close();
        done();
      });
    });
  });

  describe('Event Broadcasting', () => {
    it('should broadcast playback events to all clients', (done) => {
      const ws1 = new WebSocket('ws://localhost:3000/ws');
      const ws2 = new WebSocket('ws://localhost:3000/ws');
      let messageCount = 0;

      const handleMessage = (data: any) => {
        messageCount++;
        if (messageCount === 2) {
          expect(mockPlaybackService.emit).toHaveBeenCalledWith('playback', {
            type: 'started',
            trackId: mockTrack.id,
          });
          ws1.close();
          ws2.close();
          done();
        }
      };

      ws1.on('message', handleMessage);
      ws2.on('message', handleMessage);

      ws1.on('open', () => {
        if (ws2.readyState === WebSocket.OPEN) {
          // Both connections are open, trigger an event
          mockPlaybackService.emit('playback', {
            type: 'started',
            trackId: mockTrack.id,
          });
        }
      });

      ws2.on('open', () => {
        if (ws1.readyState === WebSocket.OPEN) {
          // Both connections are open, trigger an event
          mockPlaybackService.emit('playback', {
            type: 'started',
            trackId: mockTrack.id,
          });
        }
      });
    });
  });

  describe('Connection Management', () => {
    it('should handle client disconnection', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        ws.close();
      });

      ws.on('close', () => {
        // Connection should be cleaned up
        expect(ws.readyState).toBe(WebSocket.CLOSED);
        done();
      });
    });

    it('should handle connection errors', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        // Force an error by sending invalid data
        (ws as any).send('invalid json');
      });

      ws.on('error', (error) => {
        expect(error).toBeDefined();
        ws.close();
        done();
      });
    });
  });

  describe('Message Format', () => {
    it('should handle malformed JSON', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        ws.send('invalid json');
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('error');
        expect(response.error).toContain('Invalid message format');
        ws.close();
        done();
      });
    });

    it('should handle missing message type', (done) => {
      const ws = new WebSocket('ws://localhost:3000/ws');

      ws.on('open', () => {
        ws.send(JSON.stringify({
          payload: { action: 'play' },
        }));
      });

      ws.on('message', (data) => {
        const response = JSON.parse(data.toString());
        expect(response.type).toBe('error');
        expect(response.error).toContain('Invalid message format');
        ws.close();
        done();
      });
    });
  });
});
