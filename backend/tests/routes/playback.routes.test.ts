import request from 'supertest';
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
  getTrackById: jest.fn(),
  loadPlaylist: jest.fn(),
  toggleShuffle: jest.fn(),
  setRepeat: jest.fn(),
};

// Mock the services
jest.mock('../../src/services/playback.service', () => ({
  PlaybackService: jest.fn().mockImplementation(() => mockPlaybackService),
}));

describe('Playback Routes Integration Tests', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let mockTrack: any;

  beforeAll(async () => {
    prisma = await TestDatabase.setup();
  });

  afterAll(async () => {
    await TestDatabase.teardown();
  });

  beforeEach(async () => {
    await TestDatabase.clean();
    jest.clearAllMocks();

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

    // Import and create app after mocks are set up
    const { createApp } = await import('../test-app');
    app = await createApp();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /tracks', () => {
    it('should return list of tracks', async () => {
      const response = await request(app.server)
        .get('/tracks');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.tracks)).toBe(true);
      expect(response.body.tracks.length).toBeGreaterThan(0);
      expect(response.body.tracks[0]).toHaveProperty('id');
      expect(response.body.tracks[0]).toHaveProperty('title');
    });

    it('should support pagination', async () => {
      const response = await request(app.server)
        .get('/tracks')
        .query({ limit: 10, offset: 0 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.tracks.length).toBeLessThanOrEqual(10);
      expect(response.body).toHaveProperty('hasMore');
    });

    it('should support search by title', async () => {
      const response = await request(app.server)
        .get('/tracks')
        .query({ search: mockTrack.title });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.tracks.some((track: any) => track.title === mockTrack.title)).toBe(true);
    });

    it('should support filtering by artist', async () => {
      const response = await request(app.server)
        .get('/tracks')
        .query({ artist: 'Test Artist' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('POST /playback/play/:trackId', () => {
    it('should start playback successfully', async () => {
      mockPlaybackService.startPlayback.mockResolvedValue(undefined);
      mockPlaybackService.getTrackById.mockResolvedValue(mockTrack);

      const response = await request(app.server)
        .post(`/playback/play/${mockTrack.id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Started playback');
      expect(mockPlaybackService.startPlayback).toHaveBeenCalledWith(mockTrack.id);
    });

    it('should handle track not found', async () => {
      mockPlaybackService.startPlayback.mockRejectedValue(new Error('Track not found'));

      const response = await request(app.server)
        .post('/playback/play/non-existent-track');

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /playback/pause', () => {
    it('should pause playback successfully', async () => {
      mockPlaybackService.pausePlayback.mockResolvedValue(undefined);

      const response = await request(app.server)
        .post('/playback/pause');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('paused');
      expect(mockPlaybackService.pausePlayback).toHaveBeenCalled();
    });
  });

  describe('POST /playback/resume', () => {
    it('should resume playback successfully', async () => {
      mockPlaybackService.resumePlayback.mockResolvedValue(undefined);

      const response = await request(app.server)
        .post('/playback/resume');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('resumed');
      expect(mockPlaybackService.resumePlayback).toHaveBeenCalled();
    });
  });

  describe('POST /playback/stop', () => {
    it('should stop playback successfully', async () => {
      mockPlaybackService.stopPlayback.mockResolvedValue(undefined);

      const response = await request(app.server)
        .post('/playback/stop');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('stopped');
      expect(mockPlaybackService.stopPlayback).toHaveBeenCalled();
    });
  });

  describe('POST /playback/next', () => {
    it('should play next track successfully', async () => {
      mockPlaybackService.playNext.mockResolvedValue(undefined);

      const response = await request(app.server)
        .post('/playback/next');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('next track');
      expect(mockPlaybackService.playNext).toHaveBeenCalled();
    });
  });

  describe('POST /playback/previous', () => {
    it('should play previous track successfully', async () => {
      mockPlaybackService.playPrevious.mockResolvedValue(undefined);

      const response = await request(app.server)
        .post('/playback/previous');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('previous track');
      expect(mockPlaybackService.playPrevious).toHaveBeenCalled();
    });
  });

  describe('POST /playback/seek', () => {
    it('should seek to position successfully', async () => {
      mockPlaybackService.seekTo.mockResolvedValue(undefined);

      const response = await request(app.server)
        .post('/playback/seek')
        .send({ position: 60 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Seeked to position 60s');
      expect(mockPlaybackService.seekTo).toHaveBeenCalledWith(60);
    });

    it('should handle missing position', async () => {
      const response = await request(app.server)
        .post('/playback/seek')
        .send({});

      expect(response.status).toBe(400);
    });
  });

  describe('POST /playback/volume', () => {
    it('should set volume successfully', async () => {
      mockPlaybackService.setVolume.mockResolvedValue(undefined);

      const response = await request(app.server)
        .post('/playback/volume')
        .send({ volume: 75 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Volume set to 75%');
      expect(mockPlaybackService.setVolume).toHaveBeenCalledWith(75);
    });

    it('should handle invalid volume range', async () => {
      const response = await request(app.server)
        .post('/playback/volume')
        .send({ volume: 150 });

      expect(response.status).toBe(400);
    });
  });

  describe('POST /playback/queue/add/:trackId', () => {
    it('should add track to queue successfully', async () => {
      mockPlaybackService.addToQueue.mockResolvedValue(undefined);

      const response = await request(app.server)
        .post(`/playback/queue/add/${mockTrack.id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('added to queue');
      expect(mockPlaybackService.addToQueue).toHaveBeenCalledWith(mockTrack.id, undefined);
    });

    it('should add track at specific position', async () => {
      mockPlaybackService.addToQueue.mockResolvedValue(undefined);

      const response = await request(app.server)
        .post(`/playback/queue/add/${mockTrack.id}`)
        .query({ position: 2 });

      expect(response.status).toBe(200);
      expect(mockPlaybackService.addToQueue).toHaveBeenCalledWith(mockTrack.id, 2);
    });
  });

  describe('DELETE /playback/queue/:position', () => {
    it('should remove track from queue successfully', async () => {
      mockPlaybackService.removeFromQueue.mockResolvedValue(undefined);

      const response = await request(app.server)
        .delete('/playback/queue/1');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Removed track at position 1');
      expect(mockPlaybackService.removeFromQueue).toHaveBeenCalledWith(1);
    });
  });

  describe('DELETE /playback/queue', () => {
    it('should clear queue successfully', async () => {
      mockPlaybackService.clearQueue.mockResolvedValue(undefined);

      const response = await request(app.server)
        .delete('/playback/queue');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('cleared');
      expect(mockPlaybackService.clearQueue).toHaveBeenCalled();
    });
  });

  describe('GET /playback/state', () => {
    it('should return playback state', async () => {
      const mockState = {
        currentTrack: mockTrack,
        isPlaying: true,
        position: 45,
        volume: 80,
        queue: [mockTrack],
        repeat: 'none' as const,
        shuffle: false,
      };

      mockPlaybackService.getPlaybackState.mockReturnValue(mockState);

      const response = await request(app.server)
        .get('/playback/state');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.state.currentTrack.id).toBe(mockTrack.id);
      expect(response.body.state.isPlaying).toBe(true);
      expect(mockPlaybackService.getPlaybackState).toHaveBeenCalled();
    });
  });

  describe('GET /playback/queue', () => {
    it('should return playback queue', async () => {
      const mockQueue = {
        tracks: [mockTrack],
        currentIndex: 0,
      };

      mockPlaybackService.getPlaybackQueue.mockReturnValue(mockQueue);

      const response = await request(app.server)
        .get('/playback/queue');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.queue.tracks.length).toBe(1);
      expect(mockPlaybackService.getPlaybackQueue).toHaveBeenCalled();
    });
  });

  describe('POST /playback/playlist/:playlistId', () => {
    it('should load playlist successfully', async () => {
      mockPlaybackService.loadPlaylist.mockResolvedValue(undefined);

      const response = await request(app.server)
        .post('/playback/playlist/test-playlist-123');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('loaded as queue');
      expect(mockPlaybackService.loadPlaylist).toHaveBeenCalledWith('test-playlist-123');
    });
  });

  describe('POST /playback/shuffle', () => {
    it('should toggle shuffle successfully', async () => {
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

      const response = await request(app.server)
        .post('/playback/shuffle');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.shuffle).toBe(true);
      expect(mockPlaybackService.toggleShuffle).toHaveBeenCalled();
    });
  });

  describe('POST /playback/repeat', () => {
    it('should set repeat mode successfully', async () => {
      mockPlaybackService.setRepeat.mockResolvedValue(undefined);

      const response = await request(app.server)
        .post('/playback/repeat')
        .send({ mode: 'track' });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Repeat mode set to track');
      expect(mockPlaybackService.setRepeat).toHaveBeenCalledWith('track');
    });

    it('should handle invalid repeat mode', async () => {
      const response = await request(app.server)
        .post('/playback/repeat')
        .send({ mode: 'invalid-mode' });

      expect(response.status).toBe(400);
    });
  });

  describe('Error Handling', () => {
    it('should handle service errors gracefully', async () => {
      mockPlaybackService.startPlayback.mockRejectedValue(new Error('Playback error'));

      const response = await request(app.server)
        .post(`/playback/play/${mockTrack.id}`);

      expect(response.status).toBe(500);
      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Internal server error');
    });

    it('should handle malformed JSON', async () => {
      const response = await request(app.server)
        .post('/playback/seek')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });
  });

  describe('Request Validation', () => {
    it('should validate trackId parameter', async () => {
      const response = await request(app.server)
        .post('/playback/play/invalid-track-id');

      expect(response.status).toBe(500);
    });

    it('should validate position parameter', async () => {
      const response = await request(app.server)
        .delete('/playback/queue/invalid-position');

      expect(response.status).toBe(400);
    });

    it('should validate volume parameter', async () => {
      const response = await request(app.server)
        .post('/playback/volume')
        .send({ volume: 'not-a-number' });

      expect(response.status).toBe(400);
    });
  });
});
