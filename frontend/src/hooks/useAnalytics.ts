import { useCallback, useRef, useState } from 'react';
import { api } from '@/lib/api';

interface ListeningSession {
  id: string;
  trackId: string;
  startTime: Date;
  segments: Array<{
    startPosition: number;
    endPosition: number;
    duration: number;
  }>;
}

export const useAnalytics = () => {
  const [currentSession, setCurrentSession] = useState<ListeningSession | null>(null);
  const [trackRatings, setTrackRatings] = useState<Record<string, number>>({});
  const segmentStartRef = useRef<number>(0);
  const lastPositionRef = useRef<number>(0);

  // Start a new listening session
  const startListeningSession = useCallback(async (trackId: string) => {
    console.log('[ANALYTICS HOOK] Starting listening session for track:', trackId);
    try {
      const response = await api.analytics.startSession(trackId);
      if (response.success && response.data) {
        const session: ListeningSession = {
          id: response.data.id,
          trackId,
          startTime: new Date(),
          segments: []
        };
        console.log('[ANALYTICS HOOK] Session started:', session.id);
        setCurrentSession(session);
        segmentStartRef.current = 0;
        lastPositionRef.current = 0;
        return session;
      }
    } catch (error) {
      console.error('Failed to start listening session:', error);
    }
    return null;
  }, []);

  // End the current listening session
  const endListeningSession = useCallback(async (completed: boolean = false, skipped: boolean = false) => {
    if (!currentSession) return;

    try {
      // Calculate total listening time from segments
      const totalTime = currentSession.segments.reduce((sum, segment) => sum + segment.duration, 0);

      await api.analytics.updateSession(currentSession.id, {
        endTime: new Date().toISOString(),
        totalTime,
        completed,
        skipped
      });

      setCurrentSession(null);
      segmentStartRef.current = 0;
      lastPositionRef.current = 0;
    } catch (error) {
      console.error('Failed to end listening session:', error);
    }
  }, [currentSession]);

  // Track a listening segment (when user listens to a specific part of the song)
  const trackSegment = useCallback(async (startPosition: number, endPosition: number) => {
    if (!currentSession || startPosition >= endPosition) return;

    const duration = endPosition - startPosition;
    const segment = { startPosition, endPosition, duration };

    try {
      await api.analytics.addSegment({
        trackId: currentSession.trackId,
        sessionId: currentSession.id,
        startPosition,
        endPosition,
        duration
      });

      // Update local session
      setCurrentSession(prev => prev ? {
        ...prev,
        segments: [...prev.segments, segment]
      } : null);
    } catch (error) {
      console.error('Failed to track segment:', error);
    }
  }, [currentSession]);

  // Handle audio time updates (called frequently during playback)
  const handleTimeUpdate = useCallback((currentTime: number) => {
    if (!currentSession) return;

    const timeDiff = Math.abs(currentTime - lastPositionRef.current);
    
    // If there's a significant jump in time (>2 seconds), it's likely a seek
    if (timeDiff > 2) {
      // End the previous segment if we were tracking one
      if (lastPositionRef.current > 0) {
        trackSegment(segmentStartRef.current, lastPositionRef.current);
      }
      // Start a new segment
      segmentStartRef.current = currentTime;
    }

    lastPositionRef.current = currentTime;
  }, [currentSession, trackSegment]);

  // Handle when playback pauses (end current segment)
  const handlePause = useCallback(() => {
    if (!currentSession || lastPositionRef.current <= segmentStartRef.current) return;

    trackSegment(segmentStartRef.current, lastPositionRef.current);
    segmentStartRef.current = lastPositionRef.current;
  }, [currentSession, trackSegment]);

  // Handle when playback resumes (start new segment)
  const handlePlay = useCallback(() => {
    if (!currentSession) return;
    segmentStartRef.current = lastPositionRef.current;
  }, [currentSession]);

  // Handle track completion
  const handleTrackEnd = useCallback(() => {
    if (!currentSession) return;

    // Track the final segment
    if (lastPositionRef.current > segmentStartRef.current) {
      trackSegment(segmentStartRef.current, lastPositionRef.current);
    }

    // End session as completed
    endListeningSession(true, false);
  }, [currentSession, trackSegment, endListeningSession]);

  // Handle track skip
  const handleTrackSkip = useCallback(() => {
    if (!currentSession) return;

    // Track the segment up to skip point
    if (lastPositionRef.current > segmentStartRef.current) {
      trackSegment(segmentStartRef.current, lastPositionRef.current);
    }

    // End session as skipped
    endListeningSession(false, true);
  }, [currentSession, trackSegment, endListeningSession]);

  // Rating functions
  const incrementRating = useCallback(async (trackId: string) => {
    try {
      const response = await api.analytics.incrementRating(trackId);
      console.log('[ANALYTICS HOOK] Increment rating response:', response);
      if (response.success && response.data) {
        setTrackRatings(prev => ({
          ...prev,
          [trackId]: response.data.rating
        }));
        return response.data.rating;
      }
    } catch (error) {
      console.error('Failed to increment rating:', error);
    }
    return null;
  }, []);

  const decrementRating = useCallback(async (trackId: string) => {
    try {
      const response = await api.analytics.decrementRating(trackId);
      console.log('[ANALYTICS HOOK] Decrement rating response:', response);
      if (response.success && response.data) {
        setTrackRatings(prev => ({
          ...prev,
          [trackId]: response.data.rating
        }));
        return response.data.rating;
      }
    } catch (error) {
      console.error('Failed to decrement rating:', error);
    }
    return null;
  }, []);

  // Get track analytics
  const getTrackAnalytics = useCallback(async (trackId: string) => {
    try {
      const response = await api.analytics.getTrackAnalytics(trackId);
      if (response.success) {
        // Update local rating cache
        setTrackRatings(prev => ({
          ...prev,
          [trackId]: response.data.rating
        }));
        return response.data;
      }
    } catch (error) {
      console.error('Failed to get track analytics:', error);
    }
    return null;
  }, []);

  // Get track rating from cache or fetch it
  const getTrackRating = useCallback((trackId: string) => {
    return trackRatings[trackId] || 0;
  }, [trackRatings]);

  return {
    // Session management
    currentSession,
    startListeningSession,
    endListeningSession,
    
    // Playback event handlers
    handleTimeUpdate,
    handlePause,
    handlePlay,
    handleTrackEnd,
    handleTrackSkip,
    
    // Rating functions
    incrementRating,
    decrementRating,
    getTrackRating,
    getTrackAnalytics,
    
    // State
    trackRatings
  };
};
