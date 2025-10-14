import { PrismaClient } from '@prisma/client';

export interface SearchArtist {
  id: string;
  name: string;
  trackCount: number;
  albumCount: number;
  missingTrackCount: number;
  hasMissingAudio: boolean;
}

export interface SearchAlbum {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  trackCount: number;
  albumType: string;
  coverUrl?: string;
  missingTrackCount: number;
  hasMissingAudio: boolean;
}

export interface SearchTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  artistId: string;
  albumId: string;
  duration: number;
  filePath: string | null;
  fileSize: number | null;
  youtubeId: string | null;
  likeability: number;
  incorrectMatch: boolean;
  incorrectFlaggedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchResults {
  artists: SearchArtist[];
  albums: SearchAlbum[];
  tracks: SearchTrack[];
  totalArtists: number;
  totalAlbums: number;
  totalTracks: number;
}

export interface SearchOptions {
  query?: string;
  limit?: number;
  offset?: number;
  artistLimit?: number;
  albumLimit?: number;
  trackLimit?: number;
}

export class SearchService {
  constructor(private prisma: PrismaClient) {}

  async searchArtists(query: string, limit: number = 20, offset: number = 0): Promise<{ artists: SearchArtist[]; total: number }> {
    const where = query ? {
      name: {
        contains: query,
        mode: 'insensitive' as const
      }
    } : {};

    const [artists, total] = await Promise.all([
      this.prisma.artist.findMany({
        where,
        include: {
          _count: {
            select: {
              tracks: true,
              albums: true
            }
          }
        },
        orderBy: { name: 'asc' },
        skip: offset,
        take: limit
      }),
      this.prisma.artist.count({ where })
    ]);

    const artistIds = artists.map(artist => artist.id);
    const missingByArtist = artistIds.length > 0
      ? await this.prisma.track.groupBy({
          by: ['artistId'],
          where: {
            artistId: { in: artistIds },
            filePath: null
          },
          _count: {
            _all: true
          }
        })
      : [];

    const missingArtistMap = new Map<string, number>();
    for (const entry of missingByArtist) {
      missingArtistMap.set(entry.artistId, entry._count._all);
    }

    const searchArtists: SearchArtist[] = artists.map(artist => ({
      id: artist.id,
      name: artist.name,
      trackCount: artist._count.tracks,
      albumCount: artist._count.albums,
      missingTrackCount: missingArtistMap.get(artist.id) ?? 0,
      hasMissingAudio: (missingArtistMap.get(artist.id) ?? 0) > 0
    }));

    return { artists: searchArtists, total };
  }

  async searchAlbums(query: string, limit: number = 20, offset: number = 0): Promise<{ albums: SearchAlbum[]; total: number }> {
    const where = query ? {
      OR: [
        {
          title: {
            contains: query,
            mode: 'insensitive' as const
          }
        },
        {
          artist: {
            name: {
              contains: query,
              mode: 'insensitive' as const
            }
          }
        }
      ]
    } : {};

    const [albums, total] = await Promise.all([
      this.prisma.album.findMany({
        where,
        include: {
          artist: true,
          _count: {
            select: {
              tracks: true
            }
          }
        },
        orderBy: [
          { artist: { name: 'asc' } },
          { title: 'asc' }
        ],
        skip: offset,
        take: limit
      }),
      this.prisma.album.count({ where })
    ]);

    const albumIds = albums.map(album => album.id);
    const missingByAlbum = albumIds.length > 0
      ? await this.prisma.track.groupBy({
          by: ['albumId'],
          where: {
            albumId: { in: albumIds },
            filePath: null
          },
          _count: {
            _all: true
          }
        })
      : [];

    const missingAlbumMap = new Map<string, number>();
    for (const entry of missingByAlbum) {
      missingAlbumMap.set(entry.albumId, entry._count._all);
    }

    const searchAlbums: SearchAlbum[] = albums.map(album => {
      const missingCount = missingAlbumMap.get(album.id) ?? 0;
      const result: SearchAlbum = {
        id: album.id,
        title: album.title,
        artistId: album.artistId,
        artistName: album.artist.name,
        trackCount: album._count.tracks,
        albumType: album.albumType,
        missingTrackCount: missingCount,
        hasMissingAudio: missingCount > 0
      };

      if (album.coverUrl) {
        result.coverUrl = album.coverUrl;
      }

      return result;
    });

    return { albums: searchAlbums, total };
  }

  async searchTracks(query: string, limit: number = 50, offset: number = 0): Promise<{ tracks: SearchTrack[]; total: number }> {
    const where = query ? {
      OR: [
        {
          title: {
            contains: query,
            mode: 'insensitive' as const
          }
        },
        {
          artist: {
            name: {
              contains: query,
              mode: 'insensitive' as const
            }
          }
        },
        {
          album: {
            title: {
              contains: query,
              mode: 'insensitive' as const
            }
          }
        }
      ]
    } : {};

    const [tracks, total] = await Promise.all([
      this.prisma.track.findMany({
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
      this.prisma.track.count({ where })
    ]);

    const searchTracks: SearchTrack[] = tracks.map(track => {
      const result: SearchTrack = {
        id: track.id,
        title: track.title,
        artist: track.artist?.name || 'Unknown Artist',
        album: track.album?.title || 'Unknown Album',
        artistId: track.artistId,
        albumId: track.albumId,
        duration: track.duration,
        filePath: track.filePath,
        fileSize: track.fileSize,
        likeability: track.likeability,
        createdAt: track.createdAt,
        updatedAt: track.updatedAt,
        youtubeId: track.youtubeId ?? null,
        incorrectMatch: track.incorrectMatch,
        incorrectFlaggedAt: track.incorrectFlaggedAt ?? null
      };

      return result;
    });

    return { tracks: searchTracks, total };
  }

  async searchAll(options: SearchOptions = {}): Promise<SearchResults> {
    const {
      query = '',
      artistLimit = 10,
      albumLimit = 15,
      trackLimit = 25
    } = options;

    // Perform all searches in parallel for better performance
    const [artistResults, albumResults, trackResults] = await Promise.all([
      this.searchArtists(query, artistLimit, 0),
      this.searchAlbums(query, albumLimit, 0),
      this.searchTracks(query, trackLimit, 0)
    ]);

    return {
      artists: artistResults.artists,
      albums: albumResults.albums,
      tracks: trackResults.tracks,
      totalArtists: artistResults.total,
      totalAlbums: albumResults.total,
      totalTracks: trackResults.total
    };
  }

  async getArtistTracks(artistId: string, limit: number = 50): Promise<SearchTrack[]> {
    const tracks = await this.prisma.track.findMany({
      where: { artistId },
      include: {
        artist: true,
        album: true
      },
      orderBy: [
        { album: { title: 'asc' } },
        { title: 'asc' }
      ],
      take: limit
    });

    return tracks.map(track => {
      const result: SearchTrack = {
        id: track.id,
        title: track.title,
        artist: track.artist?.name || 'Unknown Artist',
        album: track.album?.title || 'Unknown Album',
        artistId: track.artistId,
        albumId: track.albumId,
        duration: track.duration,
        filePath: track.filePath,
        fileSize: track.fileSize,
        likeability: track.likeability,
        createdAt: track.createdAt,
        updatedAt: track.updatedAt,
        youtubeId: track.youtubeId ?? null,
        incorrectMatch: track.incorrectMatch,
        incorrectFlaggedAt: track.incorrectFlaggedAt ?? null
      };

      return result;
    });
  }

  async getAlbumTracks(albumId: string): Promise<SearchTrack[]> {
    const tracks = await this.prisma.track.findMany({
      where: { albumId },
      include: {
        artist: true,
        album: true
      },
      orderBy: { title: 'asc' }
    });

    return tracks.map(track => ({
      id: track.id,
      title: track.title,
      artist: track.artist?.name || 'Unknown Artist',
      album: track.album?.title || 'Unknown Album',
      artistId: track.artistId,
      albumId: track.albumId,
      duration: track.duration,
      filePath: track.filePath,
      fileSize: track.fileSize,
      youtubeId: track.youtubeId ?? null,
      likeability: track.likeability,
      incorrectMatch: track.incorrectMatch,
      incorrectFlaggedAt: track.incorrectFlaggedAt ?? null,
      createdAt: track.createdAt,
      updatedAt: track.updatedAt
    }));
  }
}