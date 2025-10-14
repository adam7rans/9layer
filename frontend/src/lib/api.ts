// Determine backend base URL dynamically so mobile clients on LAN work.
// Order of precedence:
// 1) NEXT_PUBLIC_API_BASE (explicit override)
// 2) Window hostname + :8000 at runtime
// 3) 127.0.0.1 for SSR/fallback
export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ??
  (typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : 'http://127.0.0.1:8000');

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  filePath?: string | null;
  file_path?: string | null; // Keep for backward compatibility
  fileSize?: number | null;
  youtubeId?: string;
  likeability?: number;
  artistId?: string;
  albumId?: string;
  incorrectMatch?: boolean;
  incorrectFlaggedAt?: string | Date | null;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PlaybackState {
  isPlaying: boolean;
  currentTrack?: Track;
  position: number;
  volume: number;
  queue: Track[];
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

// Downloading
export interface DownloadJobInfo {
  jobId: string;
  title?: string;
  artist?: string;
  album?: string;
  youtubeId?: string;
  errorMessage?: string;
  errorCode?: string;
}

export interface DownloadProgressResponse {
  success: boolean;
  jobId: string;
  status: 'pending' | 'downloading' | 'processing' | 'completed' | 'failed';
  progress: number;
  currentSpeed?: string;
  eta?: string;
  title?: string;
  artist?: string;
  album?: string;
  youtubeId?: string;
  errorMessage?: string;
  errorCode?: string;
  stallDetected?: boolean;
  stallSecondsRemaining?: number;
}

// Search interfaces
export interface SearchArtist {
  id: string;
  name: string;
  trackCount: number;
  albumCount: number;
}

export interface SearchAlbum {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  trackCount: number;
  albumType: string;
  coverUrl?: string;
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
  youtubeId?: string;
  likeability: number;
  incorrectMatch?: boolean;
  incorrectFlaggedAt?: string | Date | null;
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

export const api = {
  // Health check
  health: async (): Promise<ApiResponse<{status: string}>> => {
    try {
      const response = await fetch(`${API_BASE}/health`);
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Failed to connect to backend' };
    }
  },

  retryDownloadJob: async (jobId: string): Promise<ApiResponse<{ jobId?: string; previousJobId: string }>> => {
    try {
      const response = await fetch(`${API_BASE}/download/retry/${jobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const raw = await response.json();

      if (raw.success) {
        return {
          success: true,
          data: {
            jobId: raw.jobId,
            previousJobId: raw.previousJobId,
          },
        };
      }

      return {
        success: false,
        error: raw.error || 'Retry failed',
        data: raw.previousJobId ? { previousJobId: raw.previousJobId } : undefined,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Retry failed',
      };
    }
  },

  cancelDownloadJob: async (jobId: string): Promise<ApiResponse<undefined>> => {
    try {
      const response = await fetch(`${API_BASE}/download/progress/${jobId}`, {
        method: 'DELETE',
      });
      const raw = await response.json();

      if (raw.success) {
        return { success: true };
      }

      return {
        success: false,
        error: raw.error || 'Cancel failed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Cancel failed',
      };
    }
  },

  // Get a single random track
  getRandomTrack: async (): Promise<ApiResponse<{ track: Track }>> => {
    try {
      const response = await fetch(`${API_BASE}/tracks/random`);
      const data = await response.json();
      if (data.success) {
        return { success: true, data: { track: data.track } };
      }
      return { success: false, error: data.error || 'Failed to fetch random track' };
    } catch (error) {
      return { success: false, error: 'Failed to fetch random track' };
    }
  },
  
  // Track management
  getTracks: async (params?: {
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<ApiResponse<{tracks: Track[], total: number}>> => {
    try {
      const queryParams = new URLSearchParams();
      if (params?.limit) queryParams.set('limit', params.limit.toString());
      if (params?.offset) queryParams.set('offset', params.offset.toString());
      if (params?.search) queryParams.set('search', params.search);
      
      const response = await fetch(`${API_BASE}/tracks?${queryParams}`);
      const data = await response.json();
      
      // Backend returns {success: true, tracks: [...], total: number}
      // Transform to match frontend expectation
      if (data.success) {
        return {
          success: true,
          data: {
            tracks: data.tracks,
            total: data.total
          }
        };
      } else {
        return { success: false, error: data.error || 'Failed to fetch tracks' };
      }
    } catch (error) {
      return { success: false, error: 'Failed to fetch tracks' };
    }
  },
  
  // Playback controls
  playTrack: async (trackId: string): Promise<ApiResponse<PlaybackState>> => {
    try {
      const response = await fetch(`${API_BASE}/playback/play/${trackId}`, {
        method: 'POST'
      });
      const data = await response.json();
      
      // Backend returns {success: true, message: string, track: object}
      // We need to return a PlaybackState, so let's get the current state after playing
      if (data.success) {
        // Get current playback state after starting playback
        const stateResponse = await fetch(`${API_BASE}/playback/state`);
        const stateData = await stateResponse.json();
        
        if (stateData.success) {
          return {
            success: true,
            data: stateData.state
          };
        }
      }
      
      return { success: false, error: data.error || 'Failed to play track' };
    } catch (error) {
      return { success: false, error: 'Failed to play track' };
    }
  },
  
  pausePlayback: async (): Promise<ApiResponse<PlaybackState>> => {
    try {
      const response = await fetch(`${API_BASE}/playback/pause`, {
        method: 'POST'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Failed to pause playback' };
    }
  },
  
  resumePlayback: async (): Promise<ApiResponse<PlaybackState>> => {
    try {
      const response = await fetch(`${API_BASE}/playback/resume`, {
        method: 'POST'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Failed to resume playback' };
    }
  },
  
  stopPlayback: async (): Promise<ApiResponse<PlaybackState>> => {
    try {
      const response = await fetch(`${API_BASE}/playback/stop`, {
        method: 'POST'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Failed to stop playback' };
    }
  },
  
  getPlaybackState: async (): Promise<ApiResponse<PlaybackState>> => {
    try {
      const response = await fetch(`${API_BASE}/playback/state`);
      const data = await response.json();
      
      // Backend returns {success: true, state: PlaybackState}
      if (data.success) {
        return {
          success: true,
          data: data.state
        };
      }
      
      return { success: false, error: data.error || 'Failed to get playback state' };
    } catch (error) {
      return { success: false, error: 'Failed to get playback state' };
    }
  },

  flagTrackIncorrect: async (trackId: string): Promise<ApiResponse<void>> => {
    try {
      console.log('[API] Calling POST /tracks/:trackId/incorrect', { trackId, url: `${API_BASE}/tracks/${trackId}/incorrect` });
      const response = await fetch(`${API_BASE}/tracks/${trackId}/incorrect`, {
        method: 'POST'
      });
      const data = await response.json();
      console.log('[API] Flag response:', { status: response.status, data });
      if (data.success) {
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to flag track' };
    } catch (error) {
      console.error('[API] Flag track error:', error);
      return { success: false, error: 'Failed to flag track' };
    }
  },

  clearTrackIncorrect: async (trackId: string): Promise<ApiResponse<void>> => {
    try {
      console.log('[API] Calling DELETE /tracks/:trackId/incorrect', { trackId, url: `${API_BASE}/tracks/${trackId}/incorrect` });
      const response = await fetch(`${API_BASE}/tracks/${trackId}/incorrect`, {
        method: 'DELETE'
      });
      const data = await response.json();
      console.log('[API] Clear flag response:', { status: response.status, data });
      if (data.success) {
        return { success: true };
      }
      return { success: false, error: data.error || 'Failed to clear flag' };
    } catch (error) {
      console.error('[API] Clear flag error:', error);
      return { success: false, error: 'Failed to clear flag' };
    }
  },
  
  // Volume and controls
  setVolume: async (volume: number): Promise<ApiResponse<PlaybackState>> => {
    try {
      const response = await fetch(`${API_BASE}/playback/volume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ volume })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Failed to set volume' };
    }
  },
  
  seek: async (position: number): Promise<ApiResponse<PlaybackState>> => {
    try {
      const response = await fetch(`${API_BASE}/playback/seek`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ position })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Failed to seek' };
    }
  },
  
  // Queue management
  getQueue: async (): Promise<ApiResponse<{queue: Track[]}>> => {
    try {
      const response = await fetch(`${API_BASE}/playback/queue`);
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Failed to get queue' };
    }
  },
  
  addToQueue: async (trackId: string): Promise<ApiResponse<{queue: Track[]}>> => {
    try {
      const response = await fetch(`${API_BASE}/playback/queue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ track_id: trackId })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Failed to add to queue' };
    }
  },
  
  clearQueue: async (): Promise<ApiResponse<{queue: Track[]}>> => {
    try {
      const response = await fetch(`${API_BASE}/playback/queue`, {
        method: 'DELETE'
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Failed to clear queue' };
    }
  },
  
  // Download functionality
  downloadAudio: async (url: string): Promise<ApiResponse<{ jobId?: string; trackId?: string; filePath?: string }>> => {
    try {
      const response = await fetch(`${API_BASE}/download/audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Failed to download audio' };
    }
  },
  
  downloadPlaylist: async (url: string): Promise<ApiResponse<{ tracksQueued: number; jobs: DownloadJobInfo[] }>> => {
    try {
      const response = await fetch(`${API_BASE}/download/playlist`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url })
      });
      const data = await response.json();
      if (data.success) {
        return { success: true, data: { tracksQueued: data.tracksQueued, jobs: data.jobs || [] } };
      }
      return { success: false, error: data.error || 'Failed to start playlist download' };
    } catch (error) {
      return { success: false, error: 'Failed to start playlist download' };
    }
  },
  
  getDownloadProgress: async (jobId: string): Promise<DownloadProgressResponse> => {
    const response = await fetch(`${API_BASE}/download/progress/${jobId}`);
    return await response.json();
  },

  // Search functionality
  searchAll: async (params: {
    query?: string;
    artistLimit?: number;
    albumLimit?: number;
    trackLimit?: number;
  }): Promise<ApiResponse<SearchResults>> => {
    try {
      const queryParams = new URLSearchParams();
      if (params.query) queryParams.set('q', params.query);
      if (params.artistLimit) queryParams.set('artistLimit', params.artistLimit.toString());
      if (params.albumLimit) queryParams.set('albumLimit', params.albumLimit.toString());
      if (params.trackLimit) queryParams.set('trackLimit', params.trackLimit.toString());

      const response = await fetch(`${API_BASE}/search/all?${queryParams}`);
      const data = await response.json();

      if (data.success) {
        return {
          success: true,
          data: data.results
        };
      }

      return { success: false, error: data.error || 'Search failed' };
    } catch (error) {
      return { success: false, error: 'Search failed' };
    }
  },

  getArtistTracks: async (artistId: string, limit?: number): Promise<ApiResponse<{tracks: SearchTrack[]}>> => {
    try {
      const queryParams = new URLSearchParams();
      if (limit) queryParams.set('limit', limit.toString());

      const response = await fetch(`${API_BASE}/search/artist/${artistId}/tracks?${queryParams}`);
      const data = await response.json();

      if (data.success) {
        return {
          success: true,
          data: { tracks: data.tracks }
        };
      }

      return { success: false, error: data.error || 'Failed to get artist tracks' };
    } catch (error) {
      return { success: false, error: 'Failed to get artist tracks' };
    }
  },

  getAlbumTracks: async (albumId: string): Promise<ApiResponse<{tracks: SearchTrack[]}>> => {
    try {
      const response = await fetch(`${API_BASE}/search/album/${albumId}/tracks`);
      const data = await response.json();

      if (data.success) {
        return {
          success: true,
          data: { tracks: data.tracks }
        };
      }

      return { success: false, error: data.error || 'Failed to get album tracks' };
    } catch (error) {
      return { success: false, error: 'Failed to get album tracks' };
    }
  },

  // Analytics endpoints
  analytics: {
    // Start listening session
    startSession: async (trackId: string, userId?: string): Promise<ApiResponse<any>> => {
      try {
        const response = await fetch(`${API_BASE}/analytics/session/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackId, userId })
        });
        return await response.json();
      } catch (error) {
        return { success: false, error: 'Failed to start listening session' };
      }
    },

    // Update listening session
    updateSession: async (sessionId: string, data: {
      endTime?: string;
      totalTime?: number;
      completed?: boolean;
      skipped?: boolean;
    }): Promise<ApiResponse<any>> => {
      try {
        const response = await fetch(`${API_BASE}/analytics/session/${sessionId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        return await response.json();
      } catch (error) {
        return { success: false, error: 'Failed to update listening session' };
      }
    },

    // Add playback segment
    addSegment: async (data: {
      trackId: string;
      sessionId: string;
      startPosition: number;
      endPosition: number;
      duration: number;
    }): Promise<ApiResponse<any>> => {
      try {
        const response = await fetch(`${API_BASE}/analytics/segment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        return await response.json();
      } catch (error) {
        return { success: false, error: 'Failed to add playback segment' };
      }
    },

    // Increment track rating (plus button)
    incrementRating: async (trackId: string, userId?: string): Promise<ApiResponse<any>> => {
      try {
        const response = await fetch(`${API_BASE}/analytics/rating/${trackId}/increment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });
        return await response.json();
      } catch (error) {
        return { success: false, error: 'Failed to increment rating' };
      }
    },

    // Decrement track rating (minus button)
    decrementRating: async (trackId: string, userId?: string): Promise<ApiResponse<any>> => {
      try {
        const response = await fetch(`${API_BASE}/analytics/rating/${trackId}/decrement`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId })
        });
        return await response.json();
      } catch (error) {
        return { success: false, error: 'Failed to decrement rating' };
      }
    },

    // Get track analytics
    getTrackAnalytics: async (trackId: string, userId?: string): Promise<any | null> => {
      try {
        const queryParams = new URLSearchParams();
        if (userId) queryParams.set('userId', userId);
        
        const response = await fetch(`${API_BASE}/analytics/track/${trackId}?${queryParams}`);
        const raw = await response.json();
        if (raw.success) {
          return raw.data;
        }
        return null;
      } catch (error) {
        return null;
      }
    },

    // Get top tracks
    getTopTracks: async (userId?: string, limit?: number): Promise<ApiResponse<any>> => {
      try {
        const queryParams = new URLSearchParams();
        if (userId) queryParams.set('userId', userId);
        if (limit) queryParams.set('limit', limit.toString());
        
        const response = await fetch(`${API_BASE}/analytics/top-tracks?${queryParams}`);
        return await response.json();
      } catch (error) {
        return { success: false, error: 'Failed to get top tracks' };
      }
    },

    // Get listening history
    getHistory: async (userId?: string, limit?: number): Promise<ApiResponse<any>> => {
      try {
        const queryParams = new URLSearchParams();
        if (userId) queryParams.set('userId', userId);
        if (limit) queryParams.set('limit', limit.toString());
        
        const response = await fetch(`${API_BASE}/analytics/history?${queryParams}`);
        return await response.json();
      } catch (error) {
        return { success: false, error: 'Failed to get listening history' };
      }
    },

    // Get rated tracks
    getRatedTracks: async (userId?: string, filter?: 'positive' | 'negative' | 'all'): Promise<ApiResponse<any>> => {
      try {
        const queryParams = new URLSearchParams();
        if (userId) queryParams.set('userId', userId);
        if (filter) queryParams.set('filter', filter);
        
        const response = await fetch(`${API_BASE}/analytics/rated-tracks?${queryParams}`);
        return await response.json();
      } catch (error) {
        return { success: false, error: 'Failed to get rated tracks' };
      }
    },

    // Get detailed play history for a specific track
    getDetailedTrackHistory: async (trackId: string, userId?: string): Promise<ApiResponse<any>> => {
      try {
        const queryParams = new URLSearchParams();
        if (userId) queryParams.set('userId', userId);
        
        const response = await fetch(`${API_BASE}/analytics/track/${trackId}/detailed-history?${queryParams}`);
        return await response.json();
      } catch (error) {
        return { success: false, error: 'Failed to get detailed track history' };
      }
    },

    // Get heatmap data for track timeline (YouTube-style hotspot visualization)
    getTrackHeatmap: async (trackId: string, userId?: string, bucketCount?: number): Promise<ApiResponse<any>> => {
      try {
        const queryParams = new URLSearchParams();
        if (userId) queryParams.set('userId', userId);
        if (bucketCount) queryParams.set('bucketCount', bucketCount.toString());
        
        const response = await fetch(`${API_BASE}/analytics/track/${trackId}/heatmap?${queryParams}`);
        return await response.json();
      } catch (error) {
        return { success: false, error: 'Failed to get track heatmap' };
      }
    },
  },
};

export default api;
