import { Track, Artist, Album } from '../src/types/api.types';

export class TestDataFactory {
  static createArtist(overrides: Partial<Artist> = {}): Artist {
    return {
      id: `artist_${Date.now()}`,
      name: 'Test Artist',
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createAlbum(overrides: Partial<Album> = {}): Album {
    return {
      id: `album_${Date.now()}`,
      title: 'Test Album',
      artistId: `artist_${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createTrack(overrides: Partial<Track> = {}): Track {
    return {
      id: `track_${Date.now()}`,
      title: 'Test Track',
      artistId: `artist_${Date.now()}`,
      albumId: `album_${Date.now()}`,
      duration: 180,
      filePath: '/test/path/audio.mp3',
      fileSize: 1024,
      youtubeId: 'test123',
      likeability: 0.5,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
  }

  static createMultipleTracks(count: number): Track[] {
    return Array.from({ length: count }, (_, index) =>
      this.createTrack({
        id: `track_${index}`,
        title: `Test Track ${index}`,
        youtubeId: `test${index}`,
      })
    );
  }

  static createDownloadOptions(overrides: any = {}) {
    return {
      url: 'https://www.youtube.com/watch?v=test123',
      quality: 'best' as const,
      format: 'audio' as const,
      outputDir: '/test/downloads',
      filenameTemplate: '{title}.{ext}',
      extractMetadata: true,
      ...overrides,
    };
  }

  static createWebSocketMessage(overrides: any = {}) {
    return {
      type: 'command',
      payload: {
        action: 'play',
        trackId: 'test123',
      },
      timestamp: new Date(),
      ...overrides,
    };
  }
}
