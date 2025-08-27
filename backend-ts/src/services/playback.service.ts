import { EventEmitter } from 'events';
import { PrismaClient } from '@prisma/client';
import {
  Track,
  PlaybackState,
  PlaybackQueue,
  PlaybackEvent
} from '../types/api.types';

export class PlaybackService extends EventEmitter {
  private prisma: PrismaClient;
  private currentTrack: Track | null = null;
  private playbackQueue: Track[] = [];
  private currentIndex: number = -1;
  private isPlaying: boolean = false;
  private position: number = 0; // in seconds
  private volume: number = 80; // 0-100
  private repeat: 'none' | 'track' | 'queue' = 'none';
  private shuffle: boolean = false;
  private originalQueue: Track[] = []; // For shuffle restoration

  constructor(prisma: PrismaClient) {
    super();
    this.prisma = prisma;
    this.setupEventHandlers();
  }

  /**
   * Start playback of a specific track
   */
  async startPlayback(trackId: string): Promise<void> {
    const track = await this.getTrackById(trackId);
    if (!track) {
      throw new Error(`Track ${trackId} not found`);
    }

    this.currentTrack = track;
    this.isPlaying = true;
    this.position = 0;

    this.emitPlaybackEvent('started', {
      track,
      position: this.position,
      isPlaying: this.isPlaying,
    });

    // Broadcast state to all clients (will be handled by WebSocket service)
    this.broadcastState();
  }

  /**
   * Pause playback
   */
  async pausePlayback(): Promise<void> {
    if (!this.currentTrack) return;

    this.isPlaying = false;
    this.emitPlaybackEvent('paused', {
      track: this.currentTrack,
      position: this.position,
      isPlaying: this.isPlaying,
    });

    this.broadcastState();
  }

  /**
   * Resume playback
   */
  async resumePlayback(): Promise<void> {
    if (!this.currentTrack) return;

    this.isPlaying = true;
    this.emitPlaybackEvent('started', {
      track: this.currentTrack,
      position: this.position,
      isPlaying: this.isPlaying,
    });

    this.broadcastState();
  }

  /**
   * Stop playback
   */
  async stopPlayback(): Promise<void> {
    this.currentTrack = null;
    this.isPlaying = false;
    this.position = 0;

    this.emitPlaybackEvent('stopped', {});
    this.broadcastState();
  }

  /**
   * Seek to specific position
   */
  async seekTo(position: number): Promise<void> {
    if (!this.currentTrack) return;

    // Ensure position is within track duration
    this.position = Math.max(0, Math.min(position, this.currentTrack.duration));

    this.emitPlaybackEvent('started', {
      track: this.currentTrack,
      position: this.position,
      isPlaying: this.isPlaying,
    });

    this.broadcastState();
  }

  /**
   * Set volume
   */
  async setVolume(volume: number): Promise<void> {
    this.volume = Math.max(0, Math.min(100, volume));
    this.broadcastState();
  }

  /**
   * Play next track in queue
   */
  async playNext(): Promise<void> {
    if (this.playbackQueue.length === 0) return;

    if (this.repeat === 'track') {
      // Repeat current track
      this.position = 0;
      this.emitPlaybackEvent('next', {
        track: this.currentTrack,
        position: 0,
        isPlaying: true,
      });
    } else {
      // Move to next track
      let nextIndex = this.currentIndex + 1;

      if (nextIndex >= this.playbackQueue.length) {
        if (this.repeat === 'queue') {
          nextIndex = 0; // Loop back to start
        } else {
          return; // End of queue
        }
      }

      this.currentIndex = nextIndex;
      const nextTrack = this.playbackQueue[this.currentIndex];
      await this.startPlayback(nextTrack.id);
    }
  }

  /**
   * Play previous track in queue
   */
  async playPrevious(): Promise<void> {
    if (this.playbackQueue.length === 0) return;

    let prevIndex = this.currentIndex - 1;

    if (prevIndex < 0) {
      if (this.repeat === 'queue') {
        prevIndex = this.playbackQueue.length - 1; // Loop to end
      } else {
        return; // Beginning of queue
      }
    }

    this.currentIndex = prevIndex;
    const prevTrack = this.playbackQueue[this.currentIndex];
    await this.startPlayback(prevTrack.id);
  }

  /**
   * Add track to queue
   */
  async addToQueue(trackId: string, position?: number): Promise<void> {
    const track = await this.getTrackById(trackId);
    if (!track) {
      throw new Error(`Track ${trackId} not found`);
    }

    if (position !== undefined && position >= 0 && position <= this.playbackQueue.length) {
      this.playbackQueue.splice(position, 0, track);
      if (position <= this.currentIndex) {
        this.currentIndex++;
      }
    } else {
      this.playbackQueue.push(track);
    }

    this.emitPlaybackEvent('queueUpdated', {
      queue: this.playbackQueue,
      currentIndex: this.currentIndex,
    });

    this.broadcastState();
  }

  /**
   * Remove track from queue
   */
  async removeFromQueue(position: number): Promise<void> {
    if (position < 0 || position >= this.playbackQueue.length) {
      throw new Error('Invalid queue position');
    }

    const removedTrack = this.playbackQueue.splice(position, 1)[0];

    // Adjust current index if necessary
    if (position < this.currentIndex) {
      this.currentIndex--;
    } else if (position === this.currentIndex) {
      // If we removed the current track, stop playback
      await this.stopPlayback();
    }

    this.emitPlaybackEvent('queueUpdated', {
      queue: this.playbackQueue,
      currentIndex: this.currentIndex,
      removedTrack,
    });

    this.broadcastState();
  }

  /**
   * Clear the queue
   */
  async clearQueue(): Promise<void> {
    this.playbackQueue = [];
    this.currentIndex = -1;
    await this.stopPlayback();

    this.emitPlaybackEvent('queueUpdated', {
      queue: [],
      currentIndex: -1,
    });

    this.broadcastState();
  }

  /**
   * Shuffle the queue
   */
  async toggleShuffle(): Promise<void> {
    this.shuffle = !this.shuffle;

    if (this.shuffle) {
      // Save original queue order
      this.originalQueue = [...this.playbackQueue];
      // Shuffle the queue (except current track)
      const currentTrack = this.currentTrack;
      const remainingTracks = this.playbackQueue.slice(this.currentIndex + 1);
      const previousTracks = this.playbackQueue.slice(0, this.currentIndex);

      // Shuffle remaining tracks
      for (let i = remainingTracks.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingTracks[i], remainingTracks[j]] = [remainingTracks[j], remainingTracks[i]];
      }

      this.playbackQueue = [...previousTracks, currentTrack!, ...remainingTracks].filter(Boolean);
    } else {
      // Restore original queue order
      if (this.originalQueue.length > 0) {
        this.playbackQueue = [...this.originalQueue];
        // Find current track in restored queue
        this.currentIndex = this.playbackQueue.findIndex(track => track.id === this.currentTrack?.id);
      }
    }

    this.emitPlaybackEvent('queueUpdated', {
      queue: this.playbackQueue,
      currentIndex: this.currentIndex,
      shuffle: this.shuffle,
    });

    this.broadcastState();
  }

  /**
   * Set repeat mode
   */
  async setRepeat(mode: 'none' | 'track' | 'queue'): Promise<void> {
    this.repeat = mode;

    this.emitPlaybackEvent('queueUpdated', {
      queue: this.playbackQueue,
      currentIndex: this.currentIndex,
      repeat: this.repeat,
    });

    this.broadcastState();
  }

  /**
   * Get current playback state
   */
  getPlaybackState(): PlaybackState {
    return {
      currentTrack: this.currentTrack,
      isPlaying: this.isPlaying,
      position: this.position,
      volume: this.volume,
      queue: this.playbackQueue,
      repeat: this.repeat,
      shuffle: this.shuffle,
    };
  }

  /**
   * Get playback queue
   */
  getPlaybackQueue(): PlaybackQueue {
    return {
      tracks: this.playbackQueue,
      currentIndex: this.currentIndex,
    };
  }

  /**
   * Load playlist as queue
   */
  async loadPlaylist(playlistId: string): Promise<void> {
    // Get all tracks from playlist (album)
    const album = await this.prisma.album.findUnique({
      where: { id: playlistId },
      include: {
        tracks: {
          include: {
            artist: true,
            album: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!album) {
      throw new Error(`Playlist ${playlistId} not found`);
    }

    // Convert to Track format and load queue
    this.playbackQueue = album.tracks.map(track => ({
      id: track.id,
      title: track.title,
      artistId: track.artistId,
      albumId: track.albumId,
      duration: track.duration,
      filePath: track.filePath,
      fileSize: track.fileSize,
      youtubeId: track.youtubeId || undefined,
      likeability: track.likeability,
      createdAt: track.createdAt,
      updatedAt: track.updatedAt,
    }));

    this.currentIndex = -1;
    this.originalQueue = [...this.playbackQueue];

    this.emitPlaybackEvent('queueUpdated', {
      queue: this.playbackQueue,
      currentIndex: this.currentIndex,
      playlistLoaded: true,
    });

    this.broadcastState();
  }

  /**
   * Update playback position (called periodically during playback)
   */
  updatePosition(deltaSeconds: number): void {
    if (!this.currentTrack || !this.isPlaying) return;

    this.position += deltaSeconds;

    // Check if track has ended
    if (this.position >= this.currentTrack.duration) {
      this.playNext();
    } else {
      // Broadcast position update (throttled)
      this.broadcastState();
    }
  }

  // Private helper methods
  async getTrackById(trackId: string): Promise<Track | null> {
    const track = await this.prisma.track.findUnique({
      where: { id: trackId },
    });

    if (!track) return null;

    return {
      id: track.id,
      title: track.title,
      artistId: track.artistId,
      albumId: track.albumId,
      duration: track.duration,
      filePath: track.filePath,
      fileSize: track.fileSize,
      youtubeId: track.youtubeId ?? undefined,
      likeability: track.likeability,
      createdAt: track.createdAt,
      updatedAt: track.updatedAt,
    };
  }

  private setupEventHandlers(): void {
    // Setup any internal event handlers if needed
  }

  private emitPlaybackEvent(type: PlaybackEvent['type'], data: any): void {
    const event: PlaybackEvent = {
      type,
      data,
    };

    this.emit('playback', event);
    this.emit(`playback:${type}`, event);
  }

  private broadcastState(): void {
    const state = this.getPlaybackState();
    this.emit('stateChanged', state);
  }
}

// Export default instance factory
export default PlaybackService;
