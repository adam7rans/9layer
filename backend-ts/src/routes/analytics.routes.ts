import { FastifyInstance } from 'fastify';
import { analyticsService } from '../services/analytics.service.js';

export async function analyticsRoutes(fastify: FastifyInstance) {
  // Start a new listening session
  fastify.post('/analytics/session/start', async (request, reply) => {
    try {
      const { trackId, userId } = request.body as { trackId: string; userId?: string };
      
      if (!trackId) {
        return reply.status(400).send({ error: 'trackId is required' });
      }

      const session = await analyticsService.createListeningSession({
        trackId,
        userId: userId || 'default',
      });

      return reply.send(session);
    } catch (error) {
      console.error('Error starting listening session:', error);
      return reply.status(500).send({ error: 'Failed to start listening session' });
    }
  });

  // Update a listening session (when track ends, is skipped, etc.)
  fastify.put('/analytics/session/:sessionId', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const updateData = request.body as {
        endTime?: string;
        totalTime?: number;
        completed?: boolean;
        skipped?: boolean;
      };

      const updatePayload: any = {
        endTime: updateData.endTime ? new Date(updateData.endTime) : new Date(),
      };
      
      if (updateData.totalTime !== undefined) updatePayload.totalTime = updateData.totalTime;
      if (updateData.completed !== undefined) updatePayload.completed = updateData.completed;
      if (updateData.skipped !== undefined) updatePayload.skipped = updateData.skipped;
      
      const session = await analyticsService.updateListeningSession(sessionId, updatePayload);

      return reply.send(session);
    } catch (error) {
      console.error('Error updating listening session:', error);
      return reply.status(500).send({ error: 'Failed to update listening session' });
    }
  });

  // Add a playback segment (track which parts of song were listened to)
  fastify.post('/analytics/segment', async (request, reply) => {
    try {
      const { trackId, sessionId, startPosition, endPosition, duration } = request.body as {
        trackId: string;
        sessionId: string;
        startPosition: number;
        endPosition: number;
        duration: number;
      };

      if (!trackId || !sessionId || startPosition === undefined || endPosition === undefined) {
        return reply.status(400).send({ 
          error: 'trackId, sessionId, startPosition, and endPosition are required' 
        });
      }

      const segment = await analyticsService.addPlaybackSegment({
        trackId,
        sessionId,
        startPosition,
        endPosition,
        duration: duration || (endPosition - startPosition),
      });

      return reply.send(segment);
    } catch (error) {
      console.error('Error adding playback segment:', error);
      return reply.status(500).send({ error: 'Failed to add playback segment' });
    }
  });

  // Update track rating (plus/minus buttons)
  fastify.post('/analytics/rating', async (request, reply) => {
    try {
      const { trackId, rating, userId } = request.body as {
        trackId: string;
        rating: number;
        userId?: string;
      };

      if (!trackId || rating === undefined) {
        return reply.status(400).send({ error: 'trackId and rating are required' });
      }

      const trackRating = await analyticsService.updateTrackRating({
        trackId,
        rating,
        userId: userId || 'default',
      });

      return reply.send(trackRating);
    } catch (error) {
      console.error('Error updating track rating:', error);
      return reply.status(500).send({ error: 'Failed to update track rating' });
    }
  });

  // Increment track rating (plus button)
  fastify.post('/analytics/rating/:trackId/increment', async (request, reply) => {
    try {
      const { trackId } = request.params as { trackId: string };
      const { userId } = request.body as { userId?: string };

      // Get current rating
      const currentRating = await analyticsService.getTrackAnalytics(trackId, userId || 'default');
      const newRating = currentRating.rating + 1;

      const trackRating = await analyticsService.updateTrackRating({
        trackId,
        rating: newRating,
        userId: userId || 'default',
      });

      return reply.send({ success: true, data: trackRating });
    } catch (error) {
      console.error('Error incrementing track rating:', error);
      return reply.status(500).send({ success: false, error: 'Failed to increment track rating' });
    }
  });

  // Decrement track rating (minus button)
  fastify.post('/analytics/rating/:trackId/decrement', async (request, reply) => {
    try {
      const { trackId } = request.params as { trackId: string };
      const { userId } = request.body as { userId?: string };

      // Get current rating
      const currentRating = await analyticsService.getTrackAnalytics(trackId, userId || 'default');
      const newRating = currentRating.rating - 1;

      const trackRating = await analyticsService.updateTrackRating({
        trackId,
        rating: newRating,
        userId: userId || 'default',
      });

      return reply.send({ success: true, data: trackRating });
    } catch (error) {
      console.error('Error decrementing track rating:', error);
      return reply.status(500).send({ success: false, error: 'Failed to decrement track rating' });
    }
  });

  // Get track analytics
  fastify.get('/analytics/track/:trackId', async (request, reply) => {
    try {
      const { trackId } = request.params as { trackId: string };
      const { userId } = request.query as { userId?: string };

      const analytics = await analyticsService.getTrackAnalytics(trackId, userId);
      return reply.send(analytics);
    } catch (error) {
      console.error('Error getting track analytics:', error);
      return reply.status(500).send({ error: 'Failed to get track analytics' });
    }
  });

  // Get user's top tracks
  fastify.get('/analytics/top-tracks', async (request, reply) => {
    try {
      const { userId, limit } = request.query as { userId?: string; limit?: string };
      
      const topTracks = await analyticsService.getUserTopTracks(
        userId,
        limit ? parseInt(limit) : 20
      );

      return reply.send({ success: true, data: topTracks });
    } catch (error) {
      console.error('Error getting top tracks:', error);
      return reply.status(500).send({ success: false, error: 'Failed to get top tracks' });
    }
  });

  // Get listening history
  fastify.get('/analytics/history', async (request, reply) => {
    try {
      const { userId, limit } = request.query as { userId?: string; limit?: string };
      
      const history = await analyticsService.getListeningHistory(
        userId,
        limit ? parseInt(limit) : 50
      );

      return reply.send({ success: true, data: history });
    } catch (error) {
      console.error('Error getting listening history:', error);
      return reply.status(500).send({ success: false, error: 'Failed to get listening history' });
    }
  });

  // Get all rated tracks
  fastify.get('/analytics/rated-tracks', async (request, reply) => {
    try {
      const { userId, filter } = request.query as { userId?: string; filter?: 'positive' | 'negative' | 'all' };
      
      const ratedTracks = await analyticsService.getRatedTracks(userId || 'default', filter);

      return reply.send({ success: true, data: ratedTracks });
    } catch (error) {
      console.error('Error getting rated tracks:', error);
      return reply.status(500).send({ success: false, error: 'Failed to get rated tracks' });
    }
  });

  // Get detailed play history for a specific track
  fastify.get('/analytics/track/:trackId/detailed-history', async (request, reply) => {
    try {
      const { trackId } = request.params as { trackId: string };
      const { userId } = request.query as { userId?: string };

      const detailedHistory = await analyticsService.getDetailedTrackPlayHistory(
        trackId, 
        userId || 'default'
      );

      return reply.send({ success: true, data: detailedHistory });
    } catch (error) {
      console.error('Error getting detailed track history:', error);
      return reply.status(500).send({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Failed to get detailed track history' 
      });
    }
  });
}
