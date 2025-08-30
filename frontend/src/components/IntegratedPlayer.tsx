'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, Track, PlaybackState } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { 
  PlayIcon, 
  PauseIcon, 
  BackwardIcon, 
  ForwardIcon, 
  SpeakerWaveIcon, 
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  ListBulletIcon
} from '@heroicons/react/24/solid';
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
  const [currentView, setCurrentView] = useState<'library' | 'queue' | 'download'>('library');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch tracks on component mount
  useEffect(() => {
    const fetchTracks = async () => {
      try {
        const response = await api.getTracks();
        if (response.success && response.data) {
          setTracks(response.data.tracks);
        } else {
          setError('Failed to load tracks');
        }
      } catch (error) {
        console.error('Failed to fetch tracks:', error);
        setError('Failed to load tracks');
      }
    };

    fetchTracks();
  }, []);

  // Track if user has interacted with the page (required for autoplay)
  const [hasUserInteracted, setHasUserInteracted] = useState(false);

  // Poll for playback state updates
  useEffect(() => {
    const pollPlaybackState = async () => {
      try {
        const response = await api.getPlaybackState();
        
        if (response.success && response.data) {
          const state = response.data;
          
          // Don't show any current track until user interacts
          if (hasUserInteracted) {
            setPlaybackState(state);
          } else {
            // Clean initial state - no current track shown
            setPlaybackState({
              isPlaying: false,
              position: 0,
              volume: state.volume || 80,
              queue: state.queue || []
            });
          }
          
          // Only update audio element if user has interacted with the page
          if (audioRef.current && state.currentTrack && hasUserInteracted) {
            const audioUrl = `http://localhost:8000/playback/audio/${state.currentTrack.youtubeId}`;
            
            // Only update src if different and if we're not currently playing
            if (audioRef.current.src !== audioUrl && audioRef.current.paused) {
              audioRef.current.src = audioUrl;
              audioRef.current.load();
            }
            
            // Only sync playback if audio is loaded and ready
            if (audioRef.current.readyState >= 2) { // HAVE_CURRENT_DATA or higher
              if (state.isPlaying && audioRef.current.paused) {
                audioRef.current.play().catch(error => {
                  console.error('Audio play failed:', error);
                  setError('Audio playback failed: ' + error.message);
                });
              } else if (!state.isPlaying && !audioRef.current.paused) {
                audioRef.current.pause();
              }
            }
            
            // Sync volume (convert 0-100 to 0-1)
            audioRef.current.volume = state.volume / 100;
          }
        }
      } catch (error) {
        console.error('Failed to fetch playback state:', error);
      }
    };

    // Poll every 2 seconds
    const interval = setInterval(pollPlaybackState, 2000);
    pollPlaybackState(); // Initial call

    return () => clearInterval(interval);
  }, [hasUserInteracted]);

  const handlePlay = useCallback(async (trackId?: string) => {
    try {
      setError(null);
      // Mark that user has interacted with the page
      setHasUserInteracted(true);
      
      
      if (!trackId) {
        console.error('No track ID provided');
        setError('No track selected');
        return;
      }
      
      const response = await api.playTrack(trackId);
      
      if (response.success) {
        // Update local state immediately for better UX
        setPlaybackState(prev => ({
          ...prev,
          isPlaying: true,
          currentTrack: tracks.find(t => t.youtubeId === trackId) || prev.currentTrack
        }));
        
        // Try to play audio immediately since this is user-initiated
        if (audioRef.current) {
          const audioUrl = `http://localhost:8000/playback/audio/${trackId}`;
          console.log('Attempting to load audio from:', audioUrl);
          
          if (audioRef.current.src !== audioUrl) {
            audioRef.current.src = audioUrl;
            audioRef.current.load();
          }
          
          // Wait for audio to be ready before playing
          const playAudio = () => {
            if (audioRef.current && audioRef.current.readyState >= 2) {
              audioRef.current.play().catch(error => {
                console.error('Audio play failed:', error);
                setError('Audio playback failed: ' + error.message);
              });
            } else {
              // Try again in a bit if not ready
              setTimeout(playAudio, 100);
            }
          };
          
          playAudio();
        }
      } else {
        setError(response.error || 'Failed to play track');
      }
    } catch (error) {
      console.error('Failed to play track:', error);
      setError('Failed to play track');
    }
  }, [tracks]);

  const handlePause = useCallback(async () => {
    try {
      setError(null);
      // Mark that user has interacted with the page
      setHasUserInteracted(true);
      
      await api.pausePlayback();
      setPlaybackState(prev => ({ ...prev, isPlaying: false }));
      
      // Pause the audio element
      if (audioRef.current && !audioRef.current.paused) {
        audioRef.current.pause();
      }
    } catch (error) {
      console.error('Failed to pause track:', error);
      setError('Failed to pause track');
    }
  }, []);

  const handleVolumeChange = useCallback(async (value: number[]) => {
    const volume = Math.round(value[0] * 100);
    try {
      await api.setVolume(volume);
      setPlaybackState(prev => ({ ...prev, volume }));
    } catch (error) {
      console.error('Failed to set volume:', error);
    }
  }, []);

  const handleSeek = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!playbackState.currentTrack?.duration) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newPosition = percentage * playbackState.currentTrack.duration;
    
    // Update local state immediately for responsiveness
    setPlaybackState(prev => ({ ...prev, position: newPosition }));
    
    // Seek the audio element directly
    if (audioRef.current && audioRef.current.readyState >= 2) {
      audioRef.current.currentTime = newPosition;
    }
    
    // Also call backend seek API
    try {
      await api.seek(newPosition);
    } catch (error) {
      console.error('Seek API call failed:', error);
    }
    
    console.log('Seeking to:', newPosition);
  }, [playbackState.currentTrack]);


  const handleDownload = useCallback(async () => {
    if (!downloadUrl.trim()) return;
    
    setIsDownloading(true);
    setError(null);
    
    try {
      await api.downloadAudio(downloadUrl.trim());
      setDownloadUrl('');
      // Refresh tracks after successful download
      const response = await api.getTracks();
      if (response.success && response.data) {
        setTracks(response.data.tracks);
      }
    } catch (error) {
      console.error('Download failed:', error);
      setError('Download failed');
    } finally {
      setIsDownloading(false);
    }
  }, [downloadUrl]);

  const filteredTracks = tracks.filter(track =>
    track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    track.artist.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (track.album && track.album.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn("h-screen flex flex-col bg-gray-900 text-white", className)}>
      {/* Hidden Audio Element - Only show error if user has interacted */}
      <audio 
        ref={audioRef}
        preload="none"
        onError={(e) => {
          if (hasUserInteracted) {
            console.error('Audio error:', e);
            setError('Failed to load audio file');
          }
        }}
        onLoadStart={() => {}}
        onCanPlay={() => {}}
        onLoadedData={() => {}}
        onAbort={() => {}}
      />
      
      {/* Header */}
      <div className="border-b border-gray-700 bg-gray-800">
        {/* Progress Bar Row */}
        <div className="flex items-center justify-between p-3 gap-4">
          {/* Audio Timeline Progress Bar */}
          <div className="flex-1 px-4 bg-red-500/10 min-h-[20px] flex items-center">
            <div className="flex items-center gap-3 w-full">
              <span className="text-xs text-gray-400 min-w-[40px] text-center font-mono bg-green-500/20">
                {formatTime(playbackState.position)}
              </span>
              <div 
                className="flex-1 bg-gray-800 border border-gray-600 rounded-full cursor-pointer relative group min-w-[200px]"
                style={{ height: '20px' }}
                onClick={handleSeek}
              >
                {/* Background track - always visible */}
                <div className="absolute inset-0 bg-gray-700 rounded-full" />
                
                {/* Progress fill */}
                <div 
                  className="absolute top-0 left-0 h-full bg-blue-500 rounded-full z-10"
                  style={{ 
                    width: playbackState.currentTrack?.duration 
                      ? `${Math.max(2, (playbackState.position / playbackState.currentTrack.duration) * 100)}%`
                      : '2%'
                  }}
                />
                
                {/* Playhead - always visible */}
                <div 
                  className="absolute top-1/2 transform -translate-y-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full shadow-lg cursor-grab z-20"
                  style={{ 
                    left: playbackState.currentTrack?.duration 
                      ? `calc(${(playbackState.position / playbackState.currentTrack.duration) * 100}% - 8px)`
                      : '0px'
                  }}
                />
              </div>
              <span className="text-xs text-gray-400 min-w-[40px] text-center font-mono bg-green-500/20">
                {playbackState.currentTrack?.duration 
                  ? formatTime(playbackState.currentTrack.duration)
                  : '--:--'
                }
              </span>
            </div>
          </div>

          {/* Volume Control */}
          <div className="flex items-center gap-1">
            <SpeakerWaveIcon className="w-3 h-3" />
            <Slider
              value={[playbackState.volume / 100]}
              onValueChange={handleVolumeChange}
              max={1}
              step={0.1}
              className="w-16"
            />
          </div>
        </div>
        
        {/* Controls, Track Info and Navigation Row */}
        <div className="flex items-center justify-between p-3 gap-4">
          {/* Playback Controls */}
          <div className="flex items-center gap-1">
            <Button 
              variant="ghost" 
              className="h-7 w-7 p-0 min-h-[28px] min-w-[28px] max-h-[28px] max-w-[28px]"
              style={{ height: '28px', width: '28px' }}
            >
              <BackwardIcon className="w-4 h-4" />
            </Button>
            <Button
              onClick={playbackState.isPlaying ? handlePause : () => handlePlay()}
              disabled={!playbackState.currentTrack}
              className="h-7 w-7 p-0 min-h-[28px] min-w-[28px] max-h-[28px] max-w-[28px]"
              style={{ height: '28px', width: '28px' }}
            >
              {playbackState.isPlaying ? (
                <PauseIcon className="w-4 h-4" />
              ) : (
                <PlayIcon className="w-4 h-4" />
              )}
            </Button>
            <Button 
              variant="ghost" 
              className="h-7 w-7 p-0 min-h-[28px] min-w-[28px] max-h-[28px] max-w-[28px]"
              style={{ height: '28px', width: '28px' }}
            >
              <ForwardIcon className="w-4 h-4" />
            </Button>
          </div>

          {/* Track Info */}
          {playbackState.currentTrack && (
            <div className="min-w-0 flex-shrink flex-1 text-center">
              <div className="font-medium text-sm truncate">{playbackState.currentTrack.title}</div>
              <div className="text-xs text-gray-400 truncate">{playbackState.currentTrack.artist}</div>
            </div>
          )}
          
          {/* Navigation */}
          <div className="flex gap-1 flex-shrink-0">
            <Button
              variant={currentView === 'library' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('library')}
              className="h-8 w-8 p-0"
            >
              <MagnifyingGlassIcon className="w-4 h-4" />
            </Button>
            <Button
              variant={currentView === 'queue' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('queue')}
              className="h-8 w-8 p-0"
            >
              <ListBulletIcon className="w-4 h-4" />
            </Button>
            <Button
              variant={currentView === 'download' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setCurrentView('download')}
              className="h-8 w-8 p-0"
            >
              <ArrowDownTrayIcon className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-600 text-white p-2 text-sm">
          {error}
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {currentView === 'library' && (
          <div className="h-full flex flex-col">
            {/* Search */}
            <div className="p-4 border-b border-gray-700">
              <input
                type="text"
                placeholder="Search tracks..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
            </div>
            
            {/* Track List */}
            <div className="flex-1 overflow-y-auto">
              {filteredTracks.map((track) => (
                <div
                  key={track.youtubeId}
                  className="flex items-center justify-between p-3 hover:bg-gray-800 border-b border-gray-800"
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{track.title}</div>
                    <div className="text-sm text-gray-400 truncate">{track.artist} • {track.album}</div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => handlePlay(track.youtubeId)}
                    className="ml-2 flex-shrink-0"
                  >
                    <PlayIcon className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {currentView === 'queue' && (
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">Queue</h2>
            {playbackState.queue.length === 0 ? (
              <p className="text-gray-400">No tracks in queue</p>
            ) : (
              <div className="space-y-2">
                {playbackState.queue.map((track, index) => (
                  <div key={`${track.youtubeId}-${index}`} className="flex items-center justify-between p-2 bg-gray-800 rounded">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{track.title}</div>
                      <div className="text-sm text-gray-400 truncate">{track.artist}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentView === 'download' && (
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">Download Track</h2>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Enter YouTube URL..."
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <Button
                onClick={handleDownload}
                disabled={!downloadUrl.trim() || isDownloading}
              >
                {isDownloading ? 'Downloading...' : 'Download'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default IntegratedPlayer;
