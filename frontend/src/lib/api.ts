const API_BASE = 'http://localhost:8000';

export interface Track {
  id: string;
  title: string;
  artist: string;
  album?: string;
  duration?: number;
  file_path: string;
  likeability?: number;
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
      } else {
        return { success: false, error: data.error || 'Failed to get playback state' };
      }
    } catch (error) {
      return { success: false, error: 'Failed to get playback state' };
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
  downloadAudio: async (url: string): Promise<ApiResponse<{message: string}>> => {
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
  
  getDownloadStatus: async (): Promise<ApiResponse<{status: string, progress?: number}>> => {
    try {
      const response = await fetch(`${API_BASE}/download/status`);
      return await response.json();
    } catch (error) {
      return { success: false, error: 'Failed to get download status' };
    }
  }
};
