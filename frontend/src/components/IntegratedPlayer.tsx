'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, Track, PlaybackState, API_BASE } from '@/lib/api';
import { useAnalytics } from '@/hooks/useAnalytics';
import AnalyticsDashboard from './AnalyticsDashboard';
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
  ListBulletIcon,
  PlusIcon,
  MinusIcon,
  ChartBarIcon
} from '@heroicons/react/24/solid';
import { cn } from '@/lib/utils';

interface IntegratedPlayerProps {
  className?: string;
}

const IntegratedPlayer = ({ className }: IntegratedPlayerProps) => {
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    position: 0,
    volume: 0.8, // Start at 80% volume (0.8 on 0-1 scale) 
    queue: []
  });
  const [tracks, setTracks] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentView, setCurrentView] = useState<'library' | 'queue' | 'download' | 'analytics'>('library');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [showAutoplayHelp, setShowAutoplayHelp] = useState(false);
  const [localPlayback, setLocalPlayback] = useState(true);
  const [analyticsRefreshTrigger, setAnalyticsRefreshTrigger] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const initRef = useRef(false);
  const isUserAdjustingVolume = useRef(false);
  
  // Analytics hook
  const analytics = useAnalytics();

  // Load and play a random track on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const playRandom = async () => {
      try {
        const res = await api.getRandomTrack();
        if (res.success && res.data?.track) {
          const t = res.data.track;
          // Keep tracks list minimal: only the current one
          setTracks([t]);
          // Start playback directly to avoid dependency on handlePlay declaration order
          setError(null);
          const response = await api.playTrack(t.id);
          if (response.success) {
            setPlaybackState(prev => ({
              ...prev,
              isPlaying: true,
              currentTrack: t
            }));
            if (t.id) {
              await analytics.startListeningSession(t.id);
              setAnalyticsRefreshTrigger(prev => prev + 1);
            }
          } else {
            setError(response.error || 'Failed to play track');
          }
        } else if (!res.success) {
          setError(res.error || 'Failed to load random track');
        }
      } catch (e) {
        console.error('Failed to load random track:', e);
        setError('Failed to load random track');
      }
    };

    playRandom();
  }, [analytics]);

  // Set up user interaction listeners
  useEffect(() => {
    const handleUserInteraction = () => {
      setHasUserInteracted(true);
      setShowAutoplayHelp(false);
    };

    const events = ['click', 'keydown', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction);
      });
    };
  }, []);

  

  // Get current track index for navigation
  const getCurrentTrackIndex = useCallback(() => {
    if (!playbackState.currentTrack) return -1;
    return tracks.findIndex(track => track.id === playbackState.currentTrack?.id);
  }, [tracks, playbackState.currentTrack]);

  // Skip to previous track
  const handlePrevious = useCallback(async () => {
    // Previous now plays a random track
    try {
      const res = await api.getRandomTrack();
      if (res.success && res.data?.track) {
        const t = res.data.track;
        setTracks([t]);
        setError(null);
        const response = await api.playTrack(t.id);
        if (response.success) {
          setPlaybackState(prev => ({ ...prev, isPlaying: true, currentTrack: t }));
          if (t.id) {
            await analytics.startListeningSession(t.id);
            setAnalyticsRefreshTrigger(prev => prev + 1);
          }
        } else {
          setError(response.error || 'Failed to play track');
        }
      }
    } catch (e) {
      console.error('Failed to play previous (random):', e);
    }
  }, [analytics]);

  // Skip to next track
  const handleNext = useCallback(async () => {
    // Next now plays a random track
    try {
      const res = await api.getRandomTrack();
      if (res.success && res.data?.track) {
        const t = res.data.track;
        setTracks([t]);
        setError(null);
        const response = await api.playTrack(t.id);
        if (response.success) {
          setPlaybackState(prev => ({ ...prev, isPlaying: true, currentTrack: t }));
          if (t.id) {
            await analytics.startListeningSession(t.id);
            setAnalyticsRefreshTrigger(prev => prev + 1);
          }
        } else {
          setError(response.error || 'Failed to play track');
        }
      }
    } catch (e) {
      console.error('Failed to play next (random):', e);
    }
  }, [analytics]);

  // Initialize reasonable volume on first load
  useEffect(() => {
    const initializeVolume = async () => {
      try {
        const state = await api.getPlaybackState();
        if (state.success && state.data) {
          const backendVolume = state.data.volume;
          console.log('[VOLUME] Initial backend volume:', backendVolume);
          
          // If backend volume seems unreasonable (> 100 suggests it's in wrong scale), fix it
          if (backendVolume > 100) {
            console.log('[VOLUME] Backend volume seems wrong, setting to 80%');
            await api.setVolume(80);
          }
        }
      } catch (error) {
        console.error('Failed to initialize volume:', error);
      }
    };
    
    initializeVolume();
  }, []); // Run once on mount

  // Poll for playback state updates
  useEffect(() => {
    const pollPlaybackState = async () => {
      try {
        const response = await api.getPlaybackState();
        
        if (response.success && response.data) {
          const state = response.data;
          setPlaybackState(state);

          // Sync HTML5 audio element with backend state
          if (audioRef.current && state.currentTrack) {
            const audioUrl = `${API_BASE}/playback/audio/${state.currentTrack.id}`;
            
            if (localPlayback) {
              // Update audio source if different
              if (audioRef.current.src !== audioUrl) {
                audioRef.current.src = audioUrl;
                audioRef.current.load();
              }
            
              // Sync playback state - only play if user has interacted
              if (state.isPlaying && audioRef.current.paused) {
                if (hasUserInteracted) {
                  audioRef.current.play().catch(error => {
                    console.error('Audio play failed:', error);
                    setShowAutoplayHelp(true);
                  });
                } else {
                  setShowAutoplayHelp(true);
                }
              } else if (!state.isPlaying && !audioRef.current.paused) {
                audioRef.current.pause();
              }
            
              // Sync volume (backend returns 0-100, audio element expects 0-1)
              // But only if user is not currently adjusting the volume slider
              if (!isUserAdjustingVolume.current) {
                console.log('[VOLUME] Backend returned volume:', state.volume);
                // Ensure volume is always normalized to 0-1 range
                const normalizedVolume = state.volume > 1 ? state.volume / 100 : state.volume;
                const clampedVolume = Math.max(0, Math.min(1, normalizedVolume));
                
                audioRef.current.volume = clampedVolume;
                
                // Update local state to match backend (avoid fighting with the slider)
                setPlaybackState(prev => ({ 
                  ...prev, 
                  volume: clampedVolume
                }));
                console.log('[VOLUME] Set local volume to:', clampedVolume);
              }
            
              // Seek if needed (basic sync)
              if (Math.abs((audioRef.current.currentTime || 0) - (state.position || 0)) > 2) {
                audioRef.current.currentTime = state.position || 0;
              }
            } else {
              // Remote control mode: ensure local audio is not playing
              if (!audioRef.current.paused) audioRef.current.pause();
              if (audioRef.current.src) {
                audioRef.current.removeAttribute('src');
                audioRef.current.load();
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch playback state:', error);
      }
    };

    // Poll every 1 second
    const interval = setInterval(pollPlaybackState, 1000);
    pollPlaybackState(); // Initial call

    return () => clearInterval(interval);
  }, [hasUserInteracted, localPlayback]);

  // Auto-advance: when the audio element ends, play a new random track
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      handleNext();
    };
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('ended', onEnded);
    };
  }, [handleNext]);

  const handlePlay = useCallback(async (trackId?: string) => {
    try {
      setError(null);
      setHasUserInteracted(true);
      
      if (!trackId) {
        console.error('No track ID provided');
        setError('No track selected');
        return;
      }
      
      const response = await api.playTrack(trackId);
      
      if (response.success) {
        const track = tracks.find(t => t.id === trackId);
        
        // Update local state immediately for better UX
        setPlaybackState(prev => ({
          ...prev,
          isPlaying: true,
          currentTrack: track || prev.currentTrack
        }));
        
        // Start analytics session for the new track
        if (track?.id) {
          await analytics.startListeningSession(track.id);
          // Trigger analytics refresh for Recently Played and Full History
          setAnalyticsRefreshTrigger(prev => prev + 1);
        }
        
      } else {
        setError(response.error || 'Failed to play track');
      }
    } catch (error) {
      console.error('Failed to play track:', error);
      setError('Failed to play track');
    }
  }, [tracks, analytics]);

  const handlePause = useCallback(async () => {
    try {
      setError(null);
      setHasUserInteracted(true);
      
      await api.pausePlayback();
      setPlaybackState(prev => ({ ...prev, isPlaying: false }));
      
      // Track pause event for analytics
      analytics.handlePause();
      
    } catch (error) {
      console.error('Failed to pause track:', error);
      setError('Failed to pause track');
    }
  }, [analytics]);


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
    
    
    // Also call backend seek API
    try {
      await api.seek(newPosition);
    } catch (error) {
      console.error('Seek API call failed:', error);
    }
    
    console.log('Seeking to:', newPosition);
  }, [playbackState.currentTrack]);

  // Add audio event listeners for analytics tracking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      analytics.handleTimeUpdate(audio.currentTime);
    };

    const handlePlay = () => {
      analytics.handlePlay();
    };

    const handlePause = () => {
      analytics.handlePause();
    };

    const handleEnded = () => {
      analytics.handleTrackEnd();
      // Auto-advance to next track
      handleNext();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [analytics, handleNext]);

  // Rating functions
  const handleIncrementRating = useCallback(async (trackId: string) => {
    console.log('[RATING] Incrementing rating for track:', trackId);
    try {
      const result = await analytics.incrementRating(trackId);
      console.log('[RATING] Increment result:', result);
      // Trigger analytics refresh
      setAnalyticsRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to increment rating:', error);
    }
  }, [analytics]);

  const handleDecrementRating = useCallback(async (trackId: string) => {
    console.log('[RATING] Decrementing rating for track:', trackId);
    try {
      const result = await analytics.decrementRating(trackId);
      console.log('[RATING] Decrement result:', result);
      // Trigger analytics refresh
      setAnalyticsRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to decrement rating:', error);
    }
  }, [analytics]);

  // Filter tracks based on search query
  const filteredTracks = tracks.filter(track => 
    track.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    track.artist.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Format time helper function
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

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

  return (
    <div className={cn("h-screen flex flex-col bg-gray-900 text-white", className)}>
      {/* Hidden Audio Element */}
      <audio 
        ref={audioRef}
        preload="none"
        playsInline
        onError={(e) => {
          console.error('Audio element error:', e);
          setError('Audio playback error');
        }}
        className="hidden"
      />
      
      {/* Main Player */}
      <div className="bg-gray-900">
        <div className="flex items-center justify-between p-3 gap-3">
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

        </div>
        
        

        {/* Centered Playback Controls */}
        <div className="flex justify-center p-3">
          <div className="flex items-center gap-3">
            <Button 
              onClick={handlePrevious}
              disabled={false}
              variant="ghost" 
              className="h-[50px] w-[50px] p-0"
              title="Previous"
            >
              <BackwardIcon className="w-5 h-5" />
            </Button>
            <Button
              onClick={playbackState.isPlaying ? handlePause : () => handlePlay(playbackState.currentTrack?.id)}
              disabled={!playbackState.currentTrack}
              className="h-[50px] w-[50px] p-0 rounded-full"
              title={playbackState.isPlaying ? 'Pause' : 'Play'}
            >
              {playbackState.isPlaying ? (
                <PauseIcon className="w-6 h-6" />
              ) : (
                <PlayIcon className="w-6 h-6" />
              )}
            </Button>
            <Button 
              onClick={handleNext}
              disabled={false}
              variant="ghost" 
              className="h-[50px] w-[50px] p-0"
              title="Next"
            >
              <ForwardIcon className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Track Info Row */}
        {playbackState.currentTrack && (
          <div className="text-center pb-3">
            <div className="font-medium text-sm truncate">{playbackState.currentTrack.title}</div>
            <div className="text-xs text-gray-400 truncate">
              {playbackState.currentTrack.artist}
              {playbackState.currentTrack.album && ` • ${playbackState.currentTrack.album.replace(/^Album - /, '')}`}
            </div>
            {/* Local playback toggle button under metadata */}
            <div className="mt-2 flex items-center justify-center">
              <Button
                onClick={() => setLocalPlayback((v) => !v)}
                size="sm"
                variant={localPlayback ? 'default' : 'outline'}
                aria-pressed={localPlayback}
                title="Play audio locally on this device"
              >
                Play on this device {localPlayback ? 'ON' : 'OFF'}
              </Button>
            </div>
            {/* Plus / Minus action buttons under metadata */}
            <div className="mt-2 flex items-center justify-center gap-2">
              <Button
                onClick={() => playbackState.currentTrack?.id && handleIncrementRating(playbackState.currentTrack.id)}
                className="h-[50px] w-[50px] p-0"
                variant="outline"
                title="Increase rating"
              >
                <PlusIcon className="w-5 h-5" />
              </Button>
              <Button
                onClick={() => playbackState.currentTrack?.id && handleDecrementRating(playbackState.currentTrack.id)}
                className="h-[50px] w-[50px] p-0"
                variant="outline"
                title="Decrease rating"
              >
                <MinusIcon className="w-5 h-5" />
              </Button>
            </div>
            
            {/* Volume Control */}
            <div className="mt-3 px-4">
              <div className="flex items-center gap-2">
                <SpeakerWaveIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <Slider
                  value={[Math.round(Math.max(0, Math.min(1, playbackState.volume)) * 100)]}
                  onValueChange={async (value) => {
                    const volumePercent = value[0];
                    const newVolume = volumePercent / 100;
                    
                    // Mark that user is adjusting volume (prevent polling override)
                    isUserAdjustingVolume.current = true;
                    
                    // Update local state immediately for responsive UI
                    setPlaybackState(prev => ({ ...prev, volume: newVolume }));
                    
                    // Apply volume to audio element immediately
                    if (audioRef.current) {
                      audioRef.current.volume = newVolume;
                    }
                    
                    // Send to backend API to persist the volume
                    console.log('[VOLUME] Setting volume to:', volumePercent + '%');
                    try {
                      await api.setVolume(volumePercent);
                      console.log('[VOLUME] Successfully set volume on backend');
                    } catch (error) {
                      console.error('Failed to update volume on backend:', error);
                    }
                    
                    // After a longer delay, allow polling to resume
                    setTimeout(() => {
                      console.log('[VOLUME] Re-enabling volume polling');
                      isUserAdjustingVolume.current = false;
                    }, 3000); // 3 second delay to prevent snapping
                  }}
                  max={100}
                  min={0}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-gray-400 w-12 text-right">
                  {Math.round(Math.max(0, Math.min(1, playbackState.volume)) * 100)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-600 text-white p-2 text-sm">
          {error}
        </div>
      )}

      {/* Autoplay Help Banner */}
      {showAutoplayHelp && (
        <div className="bg-amber-500/20 border border-amber-500 text-amber-200 p-3 text-sm flex items-center justify-between">
          <div className="pr-3">
            <div className="font-medium">Audio playback requires user interaction.</div>
            <div className="opacity-80">
              Click any button or the play button to start audio playback.
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowAutoplayHelp(false);
                setHasUserInteracted(true);
                if (playbackState.currentTrack?.id) {
                  handlePlay(playbackState.currentTrack.id);
                }
              }}
            >
              Enable Audio
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {currentView === 'library' && (
          <div className="h-full flex flex-col">
            {/* Search Bar */}
            <div className="p-4 border-b border-gray-700">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search tracks..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>
            
            {/* Track List */}
            <div className="flex-1 overflow-y-auto">
              {filteredTracks.length === 0 ? (
                <div className="p-4 text-center text-gray-400">
                  {searchQuery ? 'No tracks found' : 'No tracks available'}
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {filteredTracks.map((track) => (
                    <div key={track.id} className="flex items-center gap-2 p-2 bg-gray-800 rounded hover:bg-gray-700 transition-colors">
                      {/* Play Button */}
                      <Button
                        onClick={() => handlePlay(track.id)}
                        className="h-8 w-8 p-0 flex-shrink-0"
                        variant={playbackState.currentTrack?.id === track.id && playbackState.isPlaying ? "default" : "ghost"}
                      >
                        {playbackState.currentTrack?.id === track.id && playbackState.isPlaying ? (
                          <PauseIcon className="w-4 h-4" />
                        ) : (
                          <PlayIcon className="w-4 h-4" />
                        )}
                      </Button>
                      
                      {/* Track Info */}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate text-sm">{track.title}</div>
                        <div className="text-xs text-gray-400 truncate">{track.artist}</div>
                      </div>
                      
                      {/* Rating Display */}
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <span>{analytics.getTrackRating(track.id || '')}</span>
                      </div>
                      
                      {/* Rating Buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          onClick={() => track.id && handleDecrementRating(track.id)}
                          className="h-6 w-6 p-0"
                          variant="ghost"
                          size="sm"
                        >
                          <MinusIcon className="w-3 h-3" />
                        </Button>
                        <Button
                          onClick={() => track.id && handleIncrementRating(track.id)}
                          className="h-6 w-6 p-0"
                          variant="ghost"
                          size="sm"
                        >
                          <PlusIcon className="w-3 h-3" />
                        </Button>
                      </div>
                      
                      {/* Duration */}
                      <div className="text-xs text-gray-400 font-mono flex-shrink-0 w-12 text-right">
                        {track.duration ? formatTime(track.duration) : '--:--'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
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

        {currentView === 'analytics' && (
          <AnalyticsDashboard
            onPlayTrack={handlePlay}
            onIncrementRating={handleIncrementRating}
            onDecrementRating={handleDecrementRating}
            getTrackRating={analytics.getTrackRating}
            playbackState={playbackState}
            tracks={tracks}
            refreshTrigger={analyticsRefreshTrigger}
          />
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="flex border-t border-gray-700 bg-gray-900">
        <Button
          onClick={() => setCurrentView('library')}
          variant={currentView === 'library' ? 'default' : 'ghost'}
          className="flex-1 rounded-none h-12 flex items-center justify-center gap-2 text-sm"
        >
          <MagnifyingGlassIcon className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Library</span>
        </Button>
        <Button
          onClick={() => setCurrentView('queue')}
          variant={currentView === 'queue' ? 'default' : 'ghost'}
          className="flex-1 rounded-none h-12 flex items-center justify-center gap-2 text-sm"
        >
          <ListBulletIcon className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Queue</span>
        </Button>
        <Button
          onClick={() => setCurrentView('analytics')}
          variant={currentView === 'analytics' ? 'default' : 'ghost'}
          className="flex-1 rounded-none h-12 flex items-center justify-center gap-2 text-sm"
        >
          <ChartBarIcon className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Analytics</span>
        </Button>
        <Button
          onClick={() => setCurrentView('download')}
          variant={currentView === 'download' ? 'default' : 'ghost'}
          className="flex-1 rounded-none h-12 flex items-center justify-center gap-2 text-sm"
        >
          <ArrowDownTrayIcon className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Download</span>
        </Button>
      </div>
    </div>
  );
};

export default IntegratedPlayer;
