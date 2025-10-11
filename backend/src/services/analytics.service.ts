import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface ListeningSessionData {
  trackId: string;
  userId?: string;
  startTime?: Date;
  endTime?: Date;
  totalTime?: number;
  completed?: boolean;
  skipped?: boolean;
}

export interface PlaybackSegmentData {
  trackId: string;
  sessionId: string;
  startPosition: number;
  endPosition: number;
  duration: number;
}

export interface TrackRatingData {
  trackId: string;
  userId?: string;
  rating: number;
}

export class AnalyticsService {
  // Create a new listening session
  async createListeningSession(data: ListeningSessionData) {
    console.log('[ANALYTICS] Creating listening session:', data);
    const createData: any = {
      trackId: data.trackId,
      userId: data.userId || 'default',
      startTime: data.startTime || new Date(),
      totalTime: data.totalTime || 0,
      completed: data.completed || false,
      skipped: data.skipped || false,
    };
    
    if (data.endTime) {
      createData.endTime = data.endTime;
    }
    
    const session = await prisma.listeningSession.create({
      data: createData,
      include: {
        track: {
          include: {
            artist: true,
            album: true,
          },
        },
      },
    });
    console.log('[ANALYTICS] Session created:', session.id);
    return session;
  }

  // Update an existing listening session
  async updateListeningSession(sessionId: string, data: Partial<ListeningSessionData>) {
    console.log('[ANALYTICS] Updating session:', sessionId, data);
    const updateData: any = {};
    
    if (data.endTime !== undefined) updateData.endTime = data.endTime;
    if (data.totalTime !== undefined) updateData.totalTime = data.totalTime;
    if (data.completed !== undefined) updateData.completed = data.completed;
    if (data.skipped !== undefined) updateData.skipped = data.skipped;
    
    const session = await prisma.listeningSession.update({
      where: { id: sessionId },
      data: updateData,
      include: {
        track: {
          include: {
            artist: true,
            album: true,
          },
        },
      },
    });
    console.log('[ANALYTICS] Session updated:', sessionId);
    return session;
  }

  // Add a playback segment to track which parts of a song were listened to
  async addPlaybackSegment(data: PlaybackSegmentData) {
    return await prisma.playbackSegment.create({
      data: {
        trackId: data.trackId,
        sessionId: data.sessionId,
        startPosition: data.startPosition,
        endPosition: data.endPosition,
        duration: data.duration,
      },
    });
  }

  // Update or create track rating (plus/minus buttons)
  async updateTrackRating(data: TrackRatingData) {
    console.log('[ANALYTICS] Updating track rating:', data);
    const userId = data.userId || 'default';
    
    const result = await prisma.trackRating.upsert({
      where: {
        trackId_userId: {
          trackId: data.trackId,
          userId: userId,
        },
      },
      update: {
        rating: data.rating,
      },
      create: {
        trackId: data.trackId,
        userId: userId,
        rating: data.rating,
      },
      include: {
        track: {
          include: {
            artist: true,
            album: true,
          },
        },
      },
    });
    console.log('[ANALYTICS] Rating updated:', result.rating);
    return result;
  }

  // Get track analytics summary
  async getTrackAnalytics(trackId: string, userId: string = 'default') {
    const [sessions, rating, segments] = await Promise.all([
      // Get all listening sessions for this track
      prisma.listeningSession.findMany({
        where: { trackId, userId },
        orderBy: { createdAt: 'desc' },
        take: 10, // Last 10 sessions
      }),
      
      // Get current rating
      prisma.trackRating.findUnique({
        where: {
          trackId_userId: {
            trackId,
            userId,
          },
        },
      }),
      
      // Get playback segments to understand listening patterns
      prisma.playbackSegment.findMany({
        where: { 
          trackId,
          listeningSession: {
            userId
          }
        },
        include: {
          listeningSession: true,
        },
        orderBy: { startPosition: 'asc' },
      }),
    ]);

    // Calculate analytics
    const totalListens = sessions.length;
    const totalTimeListened = sessions.reduce((sum, session) => sum + session.totalTime, 0);
    const completionRate = sessions.length > 0 ? 
      sessions.filter(s => s.completed).length / sessions.length : 0;
    const skipRate = sessions.length > 0 ? 
      sessions.filter(s => s.skipped).length / sessions.length : 0;

    // Calculate most listened segments
    const segmentMap = new Map<string, number>();
    segments.forEach(segment => {
      const key = `${segment.startPosition}-${segment.endPosition}`;
      segmentMap.set(key, (segmentMap.get(key) || 0) + segment.duration);
    });

    return {
      trackId,
      rating: rating?.rating || 0,
      totalListens,
      totalTimeListened,
      completionRate,
      skipRate,
      recentSessions: sessions,
      mostListenedSegments: Array.from(segmentMap.entries())
        .map(([range, duration]) => ({ range, duration }))
        .sort((a, b) => b.duration - a.duration)
        .slice(0, 5),
    };
  }

  // Get user's top tracks based on analytics
  async getUserTopTracks(userId: string = 'default', limit: number = 20) {
    const trackStats = await prisma.track.findMany({
      include: {
        artist: true,
        album: true,
        trackRatings: {
          where: { userId },
        },
        listeningSessions: {
          where: { userId },
        },
        _count: {
          select: {
            listeningSessions: {
              where: { userId },
            },
          },
        },
      },
    });

    // Calculate score based on rating, listen count, and total time
    const scoredTracks = trackStats.map(track => {
      const rating = track.trackRatings[0]?.rating || 0;
      const listenCount = track._count.listeningSessions;
      const totalTime = track.listeningSessions.reduce((sum, session) => sum + session.totalTime, 0);
      const completionRate = track.listeningSessions.length > 0 ?
        track.listeningSessions.filter(s => s.completed).length / track.listeningSessions.length : 0;

      // Weighted score: rating (40%) + listen frequency (30%) + completion rate (30%)
      const score = (rating * 0.4) + (listenCount * 0.3) + (completionRate * 0.3);

      return {
        ...track,
        analytics: {
          rating,
          listenCount,
          totalTime,
          completionRate,
          score,
        },
      };
    });

    return scoredTracks
      .sort((a, b) => b.analytics.score - a.analytics.score)
      .slice(0, limit);
  }

  // Get listening history
  async getListeningHistory(userId: string = 'default', limit: number = 50) {
    return await prisma.listeningSession.findMany({
      where: { userId },
      include: {
        track: {
          include: {
            artist: true,
            album: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  // Get all tracks with ratings
  async getRatedTracks(userId: string = 'default', filter?: 'positive' | 'negative' | 'all') {
    let ratingFilter = {};
    
    if (filter === 'positive') {
      ratingFilter = { rating: { gt: 0 } };
    } else if (filter === 'negative') {
      ratingFilter = { rating: { lt: 0 } };
    } else {
      // 'all' or undefined - show all rated tracks (non-zero)
      ratingFilter = { rating: { not: 0 } };
    }

    return await prisma.trackRating.findMany({
      where: {
        userId,
        ...ratingFilter,
      },
      include: {
        track: {
          include: {
            artist: true,
            album: true,
          },
        },
      },
      orderBy: { rating: 'desc' },
    });
  }

  // Get detailed play history for a specific track with all sessions and playback segments
  async getDetailedTrackPlayHistory(trackId: string, userId: string = 'default') {
    const [track, sessions, segments] = await Promise.all([
      // Get track info
      prisma.track.findUnique({
        where: { id: trackId },
        include: {
          artist: true,
          album: true,
        },
      }),

      // Get all listening sessions for this track
      prisma.listeningSession.findMany({
        where: { trackId, userId },
        orderBy: { createdAt: 'desc' }, // Most recent first
        include: {
          segments: {
            orderBy: { startPosition: 'asc' },
          },
        },
      }),

      // Get all playback segments for overview
      prisma.playbackSegment.findMany({
        where: { 
          trackId,
          listeningSession: {
            userId
          }
        },
        include: {
          listeningSession: true,
        },
        orderBy: { startPosition: 'asc' },
      }),
    ]);

    if (!track) {
      throw new Error('Track not found');
    }

    // Calculate overall statistics
    const totalPlays = sessions.length;
    const totalTimeListened = sessions.reduce((sum, session) => sum + session.totalTime, 0);
    const completedPlays = sessions.filter(s => s.completed).length;
    const skippedPlays = sessions.filter(s => s.skipped).length;
    const completionRate = totalPlays > 0 ? completedPlays / totalPlays : 0;
    const skipRate = totalPlays > 0 ? skippedPlays / totalPlays : 0;
    const averageListenTime = totalPlays > 0 ? totalTimeListened / totalPlays : 0;
    const averageCompletionPercentage = totalPlays > 0 && track.duration > 0 ? 
      (totalTimeListened / totalPlays) / track.duration : 0;

    // Process each session to include detailed metrics
    const detailedSessions = sessions.map(session => {
      const sessionCompletionPercentage = track.duration > 0 ? session.totalTime / track.duration : 0;
      const sessionCompletionMinSec = {
        minutes: Math.floor(session.totalTime / 60),
        seconds: Math.floor(session.totalTime % 60),
      };

      // Create timeline segments for this session
      const timelineSegments = session.segments.map(segment => ({
        startPosition: segment.startPosition,
        endPosition: segment.endPosition,
        duration: segment.duration,
        startPercentage: track.duration > 0 ? (segment.startPosition / track.duration) * 100 : 0,
        endPercentage: track.duration > 0 ? (segment.endPosition / track.duration) * 100 : 0,
      }));

      return {
        id: session.id,
        startTime: session.startTime,
        endTime: session.endTime,
        totalTime: session.totalTime,
        completed: session.completed,
        skipped: session.skipped,
        createdAt: session.createdAt,
        completionPercentage: sessionCompletionPercentage,
        completionMinSec: sessionCompletionMinSec,
        timelineSegments,
      };
    });

    // Calculate most played segments across all sessions
    const segmentMap = new Map<string, {count: number, totalDuration: number}>();
    segments.forEach(segment => {
      const key = `${segment.startPosition}-${segment.endPosition}`;
      const existing = segmentMap.get(key) || {count: 0, totalDuration: 0};
      segmentMap.set(key, {
        count: existing.count + 1,
        totalDuration: existing.totalDuration + segment.duration,
      });
    });

    const mostPlayedSegments = Array.from(segmentMap.entries())
      .map(([range, data]) => {
        const [start, end] = range.split('-').map(Number);
        return {
          range,
          startPosition: start,
          endPosition: end,
          playCount: data.count,
          totalDuration: data.totalDuration,
          startPercentage: track.duration > 0 ? (start / track.duration) * 100 : 0,
          endPercentage: track.duration > 0 ? (end / track.duration) * 100 : 0,
        };
      })
      .sort((a, b) => b.totalDuration - a.totalDuration)
      .slice(0, 10); // Top 10 most played segments

    return {
      track,
      statistics: {
        totalPlays,
        totalTimeListened,
        completedPlays,
        skippedPlays,
        completionRate,
        skipRate,
        averageListenTime,
        averageCompletionPercentage,
      },
      sessions: detailedSessions,
      mostPlayedSegments,
    };
  }

  // Generate heatmap data for track timeline (YouTube-style hotspot visualization)
  async getTrackHeatmap(trackId: string, userId: string = 'default', bucketCount: number = 100) {
    const [track, segments] = await Promise.all([
      // Get track info
      prisma.track.findUnique({
        where: { id: trackId },
        include: {
          artist: true,
          album: true,
        },
      }),

      // Get all playback segments for this track
      prisma.playbackSegment.findMany({
        where: { 
          trackId,
          listeningSession: {
            userId
          }
        },
        orderBy: { startPosition: 'asc' },
      }),
    ]);

    if (!track) {
      throw new Error('Track not found');
    }

    const trackDuration = track.duration;
    if (trackDuration === 0) {
      return { trackId, trackDuration: 0, buckets: [] };
    }

    // Create buckets for the timeline
    const bucketSize = trackDuration / bucketCount;
    const buckets = new Array(bucketCount).fill(0);

    // For each segment, increment the count for all buckets it overlaps
    segments.forEach(segment => {
      const startBucket = Math.floor(segment.startPosition / bucketSize);
      const endBucket = Math.min(Math.floor(segment.endPosition / bucketSize), bucketCount - 1);

      for (let i = startBucket; i <= endBucket; i++) {
        buckets[i]++;
      }
    });

    // Find max value for normalization
    const maxPlays = Math.max(...buckets, 1); // Avoid division by zero

    // Return normalized buckets with metadata
    const heatmapData = buckets.map((count, index) => ({
      startPosition: index * bucketSize,
      endPosition: (index + 1) * bucketSize,
      playCount: count,
      intensity: count / maxPlays, // 0-1 normalized value
    }));

    return {
      trackId,
      trackDuration,
      bucketSize,
      maxPlays,
      buckets: heatmapData,
    };
  }
}

export const analyticsService = new AnalyticsService();
