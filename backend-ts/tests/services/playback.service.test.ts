import { PlaybackService } from '../../src/services/playback.service';
import { TestDataFactory } from '../factory';
import { TestDatabase } from '../database';
import { PrismaClient } from '@prisma/client';
import { jest } from '@jest/globals';
import { EventEmitter } from 'events';

// Mock EventEmitter
const mockEmit = jest.fn();
const mockOn = jest.fn();
const mockOff = jest.fn();

jest.mock('events', () => ({
  EventEmitter: jest.fn().mockImplementation(() => ({
    emit: mockEmit,
    on: mockOn,
    off: mockOff,
  })),
}));

describe('PlaybackService', () => {
  let prisma: PrismaClient;
  let playbackService: PlaybackService;
  let mockTrack: any;

  beforeAll(async () => {
    prisma = await TestDatabase.setup();
  });

  afterAll(async () => {
    await TestDatabase.teardown();
  });

  beforeEach(async () => {
    await TestDatabase.clean();

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

    playbackService = new PlaybackService(prisma);
    jest.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with Prisma client', () => {
      expect(playbackService).toBeDefined();
      expect(playbackService).toBeInstanceOf(PlaybackService);
    });

    it('should initialize with default state', () => {
      const state = playbackService.getPlaybackState();

      expect(state).toEqual({
        currentTrack: null,
        isPlaying: false,
        position: 0,
        volume: 100,
        queue: [],
        repeat: 'none',
        shuffle: false,
      });
    });
  });

  describe('startPlayback', () => {
    it('should start playback of a track', async () => {
      await playbackService.startPlayback(mockTrack.id);

      const state = playbackService.getPlaybackState();
      expect(state.isPlaying).toBe(true);
      expect(state.currentTrack?.id).toBe(mockTrack.id);
      expect(mockEmit).toHaveBeenCalledWith('playback', {
        type: 'started',
        trackId: mockTrack.id,
      });
    });

    it('should handle non-existent track', async () => {
      await expect(playbackService.startPlayback('non-existent'))
        .rejects.toThrow('Track not found');
    });
  });

  describe('pausePlayback', () => {
    it('should pause current playback', async () => {
      await playbackService.startPlayback(mockTrack.id);
      await playbackService.pausePlayback();

      const state = playbackService.getPlaybackState();
      expect(state.isPlaying).toBe(false);
      expect(mockEmit).toHaveBeenCalledWith('playback', {
        type: 'paused',
        trackId: mockTrack.id,
      });
    });
  });

  describe('resumePlayback', () => {
    it('should resume paused playback', async () => {
      await playbackService.startPlayback(mockTrack.id);
      await playbackService.pausePlayback();
      await playbackService.resumePlayback();

      const state = playbackService.getPlaybackState();
      expect(state.isPlaying).toBe(true);
      expect(mockEmit).toHaveBeenCalledWith('playback', {
        type: 'resumed',
        trackId: mockTrack.id,
      });
    });
  });

  describe('stopPlayback', () => {
    it('should stop current playback', async () => {
      await playbackService.startPlayback(mockTrack.id);
      await playbackService.stopPlayback();

      const state = playbackService.getPlaybackState();
      expect(state.isPlaying).toBe(false);
      expect(state.currentTrack).toBeNull();
      expect(mockEmit).toHaveBeenCalledWith('playback', {
        type: 'stopped',
        trackId: mockTrack.id,
      });
    });
  });

  describe('playNext', () => {
    it('should play next track in queue', async () => {
      const nextTrack = TestDataFactory.createTrack({
        id: 'next-track',
        title: 'Next Track',
      });

      await prisma.track.create({
        data: {
          id: nextTrack.id,
          title: nextTrack.title,
          artistId: nextTrack.artistId,
          albumId: nextTrack.albumId,
          duration: nextTrack.duration,
          filePath: nextTrack.filePath,
          fileSize: nextTrack.fileSize,
          youtubeId: nextTrack.youtubeId,
          likeability: nextTrack.likeability,
        }
      });

      await playbackService.addToQueue(nextTrack.id);
      await playbackService.startPlayback(mockTrack.id);
      await playbackService.playNext();

      const state = playbackService.getPlaybackState();
      expect(state.currentTrack?.id).toBe(nextTrack.id);
      expect(mockEmit).toHaveBeenCalledWith('playback', {
        type: 'next',
        trackId: nextTrack.id,
      });
    });
  });

  describe('playPrevious', () => {
    it('should play previous track', async () => {
      const prevTrack = TestDataFactory.createTrack({
        id: 'prev-track',
        title: 'Previous Track',
      });

      await prisma.track.create({
        data: {
          id: prevTrack.id,
          title: prevTrack.title,
          artistId: prevTrack.artistId,
          albumId: prevTrack.albumId,
          duration: prevTrack.duration,
          filePath: prevTrack.filePath,
          fileSize: prevTrack.fileSize,
          youtubeId: prevTrack.youtubeId,
          likeability: prevTrack.likeability,
        }
      });

      await playbackService.startPlayback(mockTrack.id);
      await playbackService.addToQueue(prevTrack.id);
      await playbackService.playPrevious();

      const state = playbackService.getPlaybackState();
      expect(state.currentTrack?.id).toBe(prevTrack.id);
      expect(mockEmit).toHaveBeenCalledWith('playback', {
        type: 'previous',
        trackId: prevTrack.id,
      });
    });
  });

  describe('seekTo', () => {
    it('should seek to specific position', async () => {
      await playbackService.startPlayback(mockTrack.id);
      await playbackService.seekTo(60);

      const state = playbackService.getPlaybackState();
      expect(state.position).toBe(60);
      expect(mockEmit).toHaveBeenCalledWith('playback', {
        type: 'seeked',
        trackId: mockTrack.id,
        position: 60,
      });
    });

    it('should handle invalid seek position', async () => {
      await playbackService.startPlayback(mockTrack.id);

      await expect(playbackService.seekTo(-10)).rejects.toThrow('Invalid seek position');
      await expect(playbackService.seekTo(mockTrack.duration + 10)).rejects.toThrow('Invalid seek position');
    });
  });

  describe('setVolume', () => {
    it('should set volume level', async () => {
      await playbackService.setVolume(75);

      const state = playbackService.getPlaybackState();
      expect(state.volume).toBe(75);
      expect(mockEmit).toHaveBeenCalledWith('playback', {
        type: 'volumeChanged',
        volume: 75,
      });
    });

    it('should clamp volume to valid range', async () => {
      await playbackService.setVolume(150);
      expect(playbackService.getPlaybackState().volume).toBe(100);

      await playbackService.setVolume(-10);
      expect(playbackService.getPlaybackState().volume).toBe(0);
    });
  });

  describe('Queue Management', () => {
    it('should add track to queue', async () => {
      await playbackService.addToQueue(mockTrack.id);

      const queue = playbackService.getPlaybackQueue();
      expect(queue.tracks).toHaveLength(1);
      expect(queue.tracks[0].id).toBe(mockTrack.id);
    });

    it('should add track at specific position', async () => {
      const track1 = TestDataFactory.createTrack({ id: 'track1', title: 'Track 1' });
      const track2 = TestDataFactory.createTrack({ id: 'track2', title: 'Track 2' });

      await prisma.track.create({
        data: {
          id: track1.id,
          title: track1.title,
          artistId: track1.artistId,
          albumId: track1.albumId,
          duration: track1.duration,
          filePath: track1.filePath,
          fileSize: track1.fileSize,
          youtubeId: track1.youtubeId,
          likeability: track1.likeability,
        }
      });

      await prisma.track.create({
        data: {
          id: track2.id,
          title: track2.title,
          artistId: track2.artistId,
          albumId: track2.albumId,
          duration: track2.duration,
          filePath: track2.filePath,
          fileSize: track2.fileSize,
          youtubeId: track2.youtubeId,
          likeability: track2.likeability,
        }
      });

      await playbackService.addToQueue(track1.id);
      await playbackService.addToQueue(track2.id, 0);

      const queue = playbackService.getPlaybackQueue();
      expect(queue.tracks[0].id).toBe(track2.id);
      expect(queue.tracks[1].id).toBe(track1.id);
    });

    it('should remove track from queue', async () => {
      await playbackService.addToQueue(mockTrack.id);
      await playbackService.removeFromQueue(0);

      const queue = playbackService.getPlaybackQueue();
      expect(queue.tracks).toHaveLength(0);
    });

    it('should clear queue', async () => {
      await playbackService.addToQueue(mockTrack.id);
      await playbackService.clearQueue();

      const queue = playbackService.getPlaybackQueue();
      expect(queue.tracks).toHaveLength(0);
    });
  });

  describe('Repeat and Shuffle', () => {
    it('should set repeat mode', async () => {
      await playbackService.setRepeat('track');

      const state = playbackService.getPlaybackState();
      expect(state.repeat).toBe('track');
      expect(mockEmit).toHaveBeenCalledWith('playback', {
        type: 'repeatChanged',
        repeat: 'track',
      });
    });

    it('should toggle shuffle', async () => {
      await playbackService.toggleShuffle();

      const state = playbackService.getPlaybackState();
      expect(state.shuffle).toBe(true);
      expect(mockEmit).toHaveBeenCalledWith('playback', {
        type: 'shuffleChanged',
        shuffle: true,
      });
    });
  });

  describe('getTrackById', () => {
    it('should return track by ID', async () => {
      const track = await playbackService.getTrackById(mockTrack.id);

      expect(track).toBeDefined();
      expect(track?.id).toBe(mockTrack.id);
      expect(track?.title).toBe(mockTrack.title);
    });

    it('should return null for non-existent track', async () => {
      const track = await playbackService.getTrackById('non-existent');
      expect(track).toBeNull();
    });
  });

  describe('State Management', () => {
    it('should emit state changes', async () => {
      await playbackService.startPlayback(mockTrack.id);

      expect(mockEmit).toHaveBeenCalledWith('stateChanged', expect.any(Object));
    });

    it('should maintain correct state after multiple operations', async () => {
      await playbackService.startPlayback(mockTrack.id);
      await playbackService.pausePlayback();
      await playbackService.setVolume(50);
      await playbackService.seekTo(30);

      const state = playbackService.getPlaybackState();

      expect(state.currentTrack?.id).toBe(mockTrack.id);
      expect(state.isPlaying).toBe(false);
      expect(state.volume).toBe(50);
      expect(state.position).toBe(30);
    });
  });

  describe('Event Emission', () => {
    it('should emit correct events', async () => {
      await playbackService.startPlayback(mockTrack.id);
      await playbackService.pausePlayback();
      await playbackService.resumePlayback();
      await playbackService.stopPlayback();

      expect(mockEmit).toHaveBeenCalledWith('playback', expect.objectContaining({
        type: 'started',
        trackId: mockTrack.id,
      }));
      expect(mockEmit).toHaveBeenCalledWith('playback', expect.objectContaining({
        type: 'paused',
        trackId: mockTrack.id,
      }));
      expect(mockEmit).toHaveBeenCalledWith('playback', expect.objectContaining({
        type: 'resumed',
        trackId: mockTrack.id,
      }));
      expect(mockEmit).toHaveBeenCalledWith('playback', expect.objectContaining({
        type: 'stopped',
        trackId: mockTrack.id,
      }));
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors', async () => {
      jest.spyOn(prisma.track, 'findUnique').mockRejectedValue(new Error('Database error'));

      await expect(playbackService.getTrackById(mockTrack.id))
        .rejects.toThrow('Database error');
    });

    it('should handle invalid track IDs', async () => {
      await expect(playbackService.startPlayback(''))
        .rejects.toThrow('Track ID is required');
    });

    it('should handle queue operations on empty queue', async () => {
      await expect(playbackService.playNext())
        .rejects.toThrow('No next track available');
    });
  });
});
