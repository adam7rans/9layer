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
  List,
  Shuffle,
  Repeat
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

  // Poll playback state every 2 seconds
  const pollPlaybackState = useCallback(async () => {
    try {
      const response = await api.getPlaybackState();
      if (response.success && response.data) {
        setPlaybackState(response.data);
      }
    } catch (error) {
      console.error('Failed to poll playback state:', error);
    }
  }, []);

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
    pollPlaybackState();
    
    // Start polling
    pollIntervalRef.current = setInterval(pollPlaybackState, 2000);
    
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
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
      
      if (response?.success && response.data) {
        setPlaybackState(response.data);
      }
    } catch (error) {
      setError('Failed to play track');
    }
  };

  const handlePause = async () => {
    try {
      const response = await api.pausePlayback();
      if (response.success && response.data) {
        setPlaybackState(response.data);
      }
    } catch (error) {
      setError('Failed to pause playback');
    }
  };

  const handleVolumeChange = async (volume: number[]) => {
    try {
      const response = await api.setVolume(volume[0]);
      if (response.success && response.data) {
        setPlaybackState(response.data);
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
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-700">
        <h1 className="text-2xl font-bold">9layer</h1>
        <div className="flex gap-2">
          <Button
            variant={currentView === 'library' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setCurrentView('library')}
          >
            <Search className="w-4 h-4 mr-2" />
            Library
          </Button>
          <Button
            variant={currentView === 'queue' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setCurrentView('queue')}
          >
            <List className="w-4 h-4 mr-2" />
            Queue ({playbackState.queue.length})
          </Button>
          <Button
            variant={currentView === 'download' ? 'default' : 'ghost'}
            size="sm"
            onClick={() => setCurrentView('download')}
          >
            <Download className="w-4 h-4 mr-2" />
            Download
          </Button>
        </div>
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

      {/* Player Bar */}
      <div className="border-t border-gray-700 p-4 bg-gray-800">
        {/* Current Track Info */}
        {playbackState.currentTrack && (
          <div className="mb-3">
            <div className="font-medium">{playbackState.currentTrack.title}</div>
            <div className="text-sm text-gray-400">{playbackState.currentTrack.artist}</div>
          </div>
        )}

        {/* Progress Bar */}
        <div className="mb-3">
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <span>{formatTime(playbackState.position)}</span>
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
            <span>
              {playbackState.currentTrack?.duration 
                ? formatTime(playbackState.currentTrack.duration)
                : '--:--'
              }
            </span>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost">
              <SkipBack className="w-4 h-4" />
            </Button>
            <Button
              size="sm"
              onClick={playbackState.isPlaying ? handlePause : () => handlePlay()}
              disabled={!playbackState.currentTrack}
            >
              {playbackState.isPlaying ? (
                <Pause className="w-4 h-4" />
              ) : (
                <Play className="w-4 h-4" />
              )}
            </Button>
            <Button size="sm" variant="ghost">
              <SkipForward className="w-4 h-4" />
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Volume2 className="w-4 h-4" />
            <Slider
              value={[playbackState.volume]}
              onValueChange={handleVolumeChange}
              max={1}
              step={0.1}
              className="w-24"
            />
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-2 p-2 bg-red-900 border border-red-700 rounded text-red-200 text-sm">
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
    </div>
  );
};

export default IntegratedPlayer;
