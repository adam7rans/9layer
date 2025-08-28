'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, Track, PlaybackState } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  Search,
  Download,
  List
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface IntegratedPlayerProps {
  className?: string;
}

const IntegratedPlayer = ({ className }: IntegratedPlayerProps) => {
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    position: 0,
    volume: 0.8,
    queue: []
  });
  const [tracks, setTracks] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentView, setCurrentView] = useState<'library' | 'queue' | 'download'>('library');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  
  // Polling interval for playback state (workaround for WebSocket issue)
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollStartedRef = useRef(false);
  
  // Audio element ref for actual audio playback
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  // Track loading state to prevent conflicts
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  // Poll playback state every 2 seconds
  const pollPlaybackState = useCallback(async () => {
    try {
      const response = await api.getPlaybackState();
      if (response.success && response.data) {
        const newState = response.data;
        setPlaybackState(newState);
        
        // Sync audio element with backend state (but don't interfere with user-initiated loading)
        if (audioRef.current && !isAudioLoading) {
          // Sync play/pause state (only if user has interacted)
          if (newState.isPlaying && audioRef.current.paused && audioRef.current.src) {
            audioRef.current.play().catch((error) => {
              if (error.name === 'NotAllowedError') {
                setError('Click play button to start audio (browser policy)');
              } else if (error.name === 'AbortError') {
                // Ignore abort errors from rapid loading
                console.log('Audio play aborted, likely due to new track loading');
              } else {
                console.error('Audio play error:', error);
                setError('Failed to play audio');
              }
            });
          } else if (!newState.isPlaying && !audioRef.current.paused) {
            audioRef.current.pause();
          }
          
          // Sync volume (convert from 0-100 to 0-1)
          audioRef.current.volume = newState.volume / 100;
        }
      }
    } catch (error) {
      console.error('Failed to poll playback state:', error);
    }
  }, [playbackState.currentTrack]);

  // Load tracks from backend
  const loadTracks = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await api.getTracks({ 
        search: searchQuery || undefined,
        limit: 100 
      });
      if (response.success && response.data) {
        setTracks(response.data.tracks);
      } else {
        setError(response.error || 'Failed to load tracks');
      }
    } catch (error) {
      setError('Failed to connect to backend');
      console.error('Load tracks error:', error);
    } finally {
      setIsLoading(false);
    }
  }, [searchQuery]);

  // Initialize component
  useEffect(() => {
    if (pollStartedRef.current) return; // prevent duplicate intervals (e.g., StrictMode)
    pollStartedRef.current = true;

    pollPlaybackState();

    // Start polling
    pollIntervalRef.current = setInterval(pollPlaybackState, 2000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      pollStartedRef.current = false;
    };
  }, [pollPlaybackState]);

  // Debounced search effect - handles both initial load and search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadTracks();
    }, 300); // 300ms debounce

    return () => clearTimeout(timeoutId);
  }, [searchQuery, loadTracks]);

  // Playback controls
  const handlePlay = async (trackId?: string) => {
    try {
      let response;
      if (trackId) {
        response = await api.playTrack(trackId);
      } else if (playbackState.currentTrack) {
        response = await api.resumePlayback();
      } else {
        return; // No track to play
      }
      
      if (response?.success) {
        // Immediately try to play audio after user interaction
        if (audioRef.current && !isAudioLoading) {
          if (trackId) {
            // New track - update source and play
            setIsAudioLoading(true);
            const url = `http://localhost:8000/audio/${trackId}`;
            console.log('[Player] Attempting to load', url);
            // Preflight check to avoid NotSupportedError on non-audio responses
            try {
              const headResp = await fetch(url, { method: 'GET', headers: { Range: 'bytes=0-0' } });
              const ct = headResp.headers.get('content-type') || '';
              if (!(headResp.status === 200 || headResp.status === 206) || !ct.startsWith('audio/')) {
                setIsAudioLoading(false);
                const msg = `Audio not available (status ${headResp.status}, content-type ${ct || 'n/a'})`;
                console.warn('[Player]', msg, 'for', url);
                setError(msg);
                return;
              }
            } catch (e) {
              setIsAudioLoading(false);
              console.warn('[Player] Preflight fetch failed', e);
              setError('Failed to reach audio endpoint');
              return;
            }

            audioRef.current.src = url;
            audioRef.current.load();
            
            const handleCanPlay = () => {
              setIsAudioLoading(false);
              audioRef.current?.play().catch((error) => {
                if (error.name === 'AbortError') {
                  console.log('Audio play aborted during loading');
                } else {
                  console.error('Audio play error:', error);
                  setError('Failed to play audio file');
                }
              });
            };
            
            const handleError = () => {
              setIsAudioLoading(false);
              const el = audioRef.current as HTMLAudioElement | null;
              const mediaError = el?.error?.code;
              console.error('Audio element error. mediaErrorCode=', mediaError, 'src=', el?.src);
              setError('Audio file not found or cannot be loaded');
            };
            
            audioRef.current.addEventListener('canplay', handleCanPlay, { once: true });
            audioRef.current.addEventListener('error', handleError, { once: true });
          } else {
            // Resume current track
            audioRef.current.play().catch((error) => {
              if (error.name === 'AbortError') {
                console.log('Audio resume aborted');
              } else {
                console.error('Audio play error:', error);
                setError('Failed to resume audio');
              }
            });
          }
        }
        
        // Update state
        pollPlaybackState();
      }
    } catch (error) {
      setError('Failed to play track');
    }
  };

  const handlePause = async () => {
    try {
      const response = await api.pausePlayback();
      if (response.success) {
        // Immediately pause audio
        if (audioRef.current && !audioRef.current.paused) {
          audioRef.current.pause();
        }
        // Update state
        pollPlaybackState();
      }
    } catch (error) {
      setError('Failed to pause playback');
    }
  };

  const handleVolumeChange = async (volume: number[]) => {
    try {
      // Convert 0-1 to 0-100 for backend
      const response = await api.setVolume(volume[0] * 100);
      if (response.success) {
        // Immediately update audio volume
        if (audioRef.current) {
          audioRef.current.volume = volume[0];
        }
        pollPlaybackState();
      }
    } catch (error) {
      setError('Failed to set volume');
    }
  };

  const handleAddToQueue = async (trackId: string) => {
    try {
      const response = await api.addToQueue(trackId);
      if (response.success) {
        // Refresh playback state to get updated queue
        pollPlaybackState();
      }
    } catch (error) {
      setError('Failed to add to queue');
    }
  };

  const handleDownload = async () => {
    if (!downloadUrl.trim()) return;
    
    setIsDownloading(true);
    try {
      const response = await api.downloadAudio(downloadUrl);
      if (response.success) {
        setDownloadUrl('');
        // Refresh tracks after download
        loadTracks();
      } else {
        setError(response.error || 'Download failed');
      }
    } catch (error) {
      setError('Failed to download audio');
    } finally {
      setIsDownloading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn("flex flex-col h-screen bg-gray-900 text-white", className)}>
      {/* Hidden audio element for actual playback */}
      <audio 
        ref={audioRef}
        preload="none"
        onError={(e) => {
          console.error('Audio error:', e);
          setError('Failed to load audio file');
        }}
        onLoadStart={() => console.log('Audio loading started')}
        onCanPlay={() => console.log('Audio can play')}
      />
      
      {/* Header */}
      <div className="border-b border-gray-700 bg-gray-800">
        {/* Unified Header Row */}
        <div className="flex items-center justify-between p-3 gap-4">
          {/* Left: Title */}
          <h1 className="text-xl font-bold flex-shrink-0">9layer</h1>
          
          {/* Center: Player Controls (when track is playing) */}
          {playbackState.currentTrack && (
            <div className="flex items-center gap-3 flex-1 min-w-0">
              {/* Track Info */}
              <div className="min-w-0 flex-shrink">
                <div className="font-medium text-sm truncate">{playbackState.currentTrack.title}</div>
                <div className="text-xs text-gray-400 truncate">{playbackState.currentTrack.artist}</div>
              </div>
              
              {/* Playback Controls */}
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                  <SkipBack className="w-3 h-3" />
                </Button>
                <Button
                  size="sm"
                  onClick={playbackState.isPlaying ? handlePause : () => handlePlay()}
                  disabled={!playbackState.currentTrack}
                  className="h-7 w-7 p-0"
                >
                  {playbackState.isPlaying ? (
                    <Pause className="w-3 h-3" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 w-7 p-0">
                  <SkipForward className="w-3 h-3" />
                </Button>
              </div>

              {/* Progress Bar */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(playbackState.position)}</span>
                <div className="flex-1 h-1 bg-gray-600 rounded">
                  <div 
                    className="h-full bg-blue-500 rounded"
                    style={{ 
                      width: playbackState.currentTrack?.duration 
                        ? `${(playbackState.position / playbackState.currentTrack.duration) * 100}%`
                        : '0%'
                    }}
                  />
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {playbackState.currentTrack?.duration 
                    ? formatTime(playbackState.currentTrack.duration)
                    : '--:--'
                  }
                </span>
              </div>

              {/* Volume Control */}
              <div className="flex items-center gap-1">
                <Volume2 className="w-3 h-3" />
                <Slider
                  value={[playbackState.volume / 100]}
                  onValueChange={handleVolumeChange}
                  max={1}
                  step={0.1}
                  className="w-16"
                />
              </div>
            </div>
          )}
          
          {/* Right: Navigation */}
          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant={currentView === 'library' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('library')}
              className="h-8 w-8 p-0"
            >
              <Search className="w-4 h-4" />
            </Button>
            <Button
              variant={currentView === 'queue' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('queue')}
              className="h-8 w-8 p-0"
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant={currentView === 'download' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('download')}
              className="h-8 w-8 p-0"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mx-3 mb-2 p-2 bg-red-900 border border-red-700 rounded text-red-200 text-xs">
            {error}
            <button 
              onClick={() => setError(null)}
              className="ml-2 text-red-400 hover:text-red-200"
            >
              ×
            </button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Content Area */}
        <div className="flex-1 p-4 overflow-y-auto">
          {currentView === 'library' && (
            <div>
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search tracks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full p-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400"
                />
              </div>
              
              {isLoading ? (
                <div className="text-center py-8">Loading tracks...</div>
              ) : (
                <div className="space-y-2">
                  {tracks.map((track) => (
                    <div
                      key={track.id}
                      className="flex items-center justify-between p-3 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{track.title}</div>
                        <div className="text-sm text-gray-400">{track.artist}</div>
                        {track.album && (
                          <div className="text-xs text-gray-500">{track.album}</div>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handlePlay(track.id)}
                          disabled={playbackState.currentTrack?.id === track.id && playbackState.isPlaying}
                        >
                          <Play className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleAddToQueue(track.id)}
                        >
                          <List className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentView === 'queue' && (
            <div>
              <h2 className="text-xl font-bold mb-4">Queue</h2>
              {playbackState.queue.length === 0 ? (
                <div className="text-center py-8 text-gray-400">No tracks in queue</div>
              ) : (
                <div className="space-y-2">
                  {playbackState.queue.map((track, index) => (
                    <div
                      key={`${track.id}-${index}`}
                      className="flex items-center justify-between p-3 bg-gray-800 rounded-lg"
                    >
                      <div className="flex-1">
                        <div className="font-medium">{track.title}</div>
                        <div className="text-sm text-gray-400">{track.artist}</div>
                      </div>
                      <div className="text-sm text-gray-500">#{index + 1}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {currentView === 'download' && (
            <div>
              <h2 className="text-xl font-bold mb-4">Download from YouTube</h2>
              <div className="space-y-4">
                <div>
                  <input
                    type="text"
                    placeholder="Enter YouTube URL..."
                    value={downloadUrl}
                    onChange={(e) => setDownloadUrl(e.target.value)}
                    className="w-full p-3 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400"
                  />
                </div>
                <Button
                  onClick={handleDownload}
                  disabled={!downloadUrl.trim() || isDownloading}
                  className="w-full"
                >
                  {isDownloading ? 'Downloading...' : 'Download'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

export default IntegratedPlayer;
