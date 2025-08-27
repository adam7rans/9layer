'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import usePlayerSocket from '@/hooks/usePlayerSocket';
import useKeyboardShortcuts from '@/hooks/useKeyboardShortcuts';
import WaveformTimeline from './WaveformTimeline';
import SearchSidebar from './SearchSidebar';
import AlbumArt from './AlbumArt';
import { Button } from '@/components/ui/button';
import { Toggle } from '@/components/ui/toggle';
import { Slider } from '@/components/ui/slider';
import { TrackInfo, PlayerState as PlayerStateType } from '@/types/websocket';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Shuffle, 
  Volume2, 
  Search,
  Wifi,
  WifiOff
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface PlayerState extends PlayerStateType {
  currentTrack: TrackInfo | null;
  isShuffled?: boolean;
  audioUrl?: string | null;
}

const Player = () => {
  const [playerState, setPlayerState] = useState<PlayerState>({
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    currentTrack: null,
    volume: 1.0,
    isShuffled: false,
    audioUrl: null,
  });
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Session-based user interaction (resets on page load but shows prompt intelligently)
  const [userInteracted, setUserInteracted] = useState(false);
  const [showInteractionPrompt, setShowInteractionPrompt] = useState(false);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Get all the methods we need from the WebSocket hook
  const { 
    connectionStatus,
    error,
    play, 
    pause, 
    next, 
    previous, 
    seek,
    setVolume,
    playTrack,
    reconnect,
    addEventListener
  } = usePlayerSocket();

  const isConnected = connectionStatus === 'connected';

  // Function to fetch and play a random track (used for shuffle and auto-play)
  const attemptAutoPlayRandomTrack = useCallback(async () => {
    console.log('[AUTO-PLAY-RANDOM] Fetching random track from API...');
    
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch('http://127.0.0.1:8000/api/tracks?limit=1', {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const tracks = await response.json();
      
      if (tracks && tracks.length > 0) {
        const track = tracks[0];
        console.log('[AUTO-PLAY-RANDOM] Random track found:', track);
        
        const trackInfo: TrackInfo = {
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album?.title || track.album || 'Unknown Album',
          artworkUrl: track.artwork_url
        };
        
        // Generate audio URL - extract relative path from the music directory
        const musicDirPath = '/Users/7racker/Documents/9layer/music/';
        const audioUrl = `/api/audio/${track.file_path.replace(musicDirPath, '')}`;
        
        console.log('[AUTO-PLAY-RANDOM] Playing random track:', trackInfo);
        
        // Update player state
        setPlayerState(prev => ({
          ...prev,
          currentTrack: trackInfo,
          audioUrl: audioUrl,
          isPlaying: true
        }));
      } else {
        console.error('[AUTO-PLAY-RANDOM] No tracks found in response');
      }
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        console.error('[AUTO-PLAY-RANDOM] Request timed out after 5 seconds');
      } else {
        console.error('[AUTO-PLAY-RANDOM] Error fetching random track:', error);
      }
    }
  }, []);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onPlayPause: () => {
      if (!isConnected) return;
      playerState.isPlaying ? pause() : play();
    },
    onNext: () => {
      if (isConnected) next();
    },
    onPrevious: () => {
      if (isConnected) previous();
    },
    onSeekForward: () => {
      if (!isConnected) return;
      const newTime = Math.min(playerState.currentTime + 10, playerState.duration);
      handleSeek(newTime);
    },
    onSeekBackward: () => {
      if (!isConnected) return;
      const newTime = Math.max(playerState.currentTime - 10, 0);
      handleSeek(newTime);
    },
    onVolumeUp: () => {
      if (!isConnected) return;
      const newVolume = Math.min(playerState.volume + 0.1, 1);
      setVolume(newVolume);
    },
    onVolumeDown: () => {
      if (!isConnected) return;
      const newVolume = Math.max(playerState.volume - 0.1, 0);
      setVolume(newVolume);
    },
    disabled: !isConnected || isSearchOpen,
  });

  const handleSeek = useCallback((time: number) => {
    if (!isConnected) return;
    
    setPlayerState(prev => ({
      ...prev,
      currentTime: time
    }));
    
    seek(time);
  }, [isConnected, seek]);

  const handleTrackSelect = useCallback((track: TrackInfo) => {
    if (!isConnected) return;
    
    console.log('Playing track:', track);
    playTrack({ trackId: track.id });
  }, [isConnected, playTrack]);

  const handleVolumeChange = useCallback((value: number[]) => {
    if (!isConnected) return;
    setVolume(value[0] / 100);
  }, [isConnected, setVolume]);

  const handleShuffleToggle = useCallback(() => {
    if (!isConnected) return;
    
    const newShuffleState = !playerState.isShuffled;
    console.log('[SHUFFLE] Toggling shuffle to:', newShuffleState);
    
    // Update local state immediately for UI responsiveness
    setPlayerState(prev => ({
      ...prev,
      isShuffled: newShuffleState
    }));
    
    // Send shuffle command to backend (we'll implement this WebSocket command)
    // For now, we'll store the shuffle state locally and use it in auto-advance logic
  }, [isConnected, playerState.isShuffled]);

  // Handle player state updates from WebSocket
  useEffect(() => {
    const handleStateUpdate = (update: Partial<PlayerState>) => {
      console.log('[PLAYER-STATE] Received WebSocket state update:', update);
      
      setPlayerState(prev => {
        console.log('[PLAYER-STATE] Previous state:', prev);
        
        // Don't override audioUrl if it's already set and WebSocket sends null
        const newState = { ...prev, ...update };
        
        // Handle both snake_case and camelCase from WebSocket
        if (update.audio_url === null && prev.audioUrl) {
          console.log('[PLAYER-STATE] Preventing WebSocket from overriding audioUrl:', prev.audioUrl);
          newState.audioUrl = prev.audioUrl;
          delete newState.audio_url; // Remove the snake_case version
        }
        
        // Don't let WebSocket override isPlaying if we have a track loaded and playing
        if (update.isPlaying === false && prev.isPlaying === true && prev.currentTrack && prev.audioUrl) {
          console.log('[PLAYER-STATE] Preventing WebSocket from overriding isPlaying - keeping true');
          newState.isPlaying = true;
        }
        
        console.log('[PLAYER-STATE] New state after update:', newState);
        return newState;
      });
    };

    console.log('[PLAYER-STATE] Setting up WebSocket event listener');
    const unsubscribe = addEventListener(handleStateUpdate);
    
    return () => {
      console.log('[PLAYER-STATE] Cleaning up WebSocket event listener');
      unsubscribe();
    };
  }, [addEventListener]);

  // Handle HTML5 Audio element synchronization (excluding currentTime to prevent loops)
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    console.log('[HTML5-AUDIO] Syncing with state:', {
      audioUrl: playerState.audioUrl,
      isPlaying: playerState.isPlaying,
      volume: playerState.volume
    });

    // Update audio source if changed
    if (playerState.audioUrl) {
      const expectedSrc = `http://127.0.0.1:8000${playerState.audioUrl}`;
      if (!audio.src || !audio.src.includes(playerState.audioUrl)) {
        console.log('[HTML5-AUDIO] Loading new audio source:', playerState.audioUrl);
        audio.src = expectedSrc;
        audio.load();
      }
    }

    // Update volume
    audio.volume = playerState.volume;

    // Handle play/pause state - only if user has interacted in this session
    if (playerState.isPlaying && audio.paused && playerState.audioUrl && userInteracted) {
      console.log('[HTML5-AUDIO] 🎵 Starting playback (user has interacted this session)');
      audio.play().then(() => {
        console.log('[HTML5-AUDIO] ✅ Playback started successfully');
      }).catch(err => {
        console.error('[HTML5-AUDIO] ❌ Play failed:', err);
        console.log('[HTML5-AUDIO] 📝 This might be due to browser auto-play policy changes');
      });
    } else if (playerState.isPlaying && audio.paused && playerState.audioUrl && !userInteracted) {
      console.log('[HTML5-AUDIO] ⏳ Playback requested but user has not interacted - showing prompt');
      setShowInteractionPrompt(true);
    } else if (!playerState.isPlaying && !audio.paused) {
      console.log('[HTML5-AUDIO] ⏸️ Pausing playback');
      audio.pause();
    }
  }, [playerState.audioUrl, playerState.isPlaying, playerState.volume, userInteracted]);

  // Separate effect for time syncing to avoid loops
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !playerState.audioUrl) return;

    // Sync current time (with debouncing to avoid loops)
    const timeDiff = Math.abs(audio.currentTime - playerState.currentTime);
    if (timeDiff > 1) { // Sync if more than 1 second different
      console.log('[HTML5-AUDIO] Syncing time:', playerState.currentTime);
      audio.currentTime = playerState.currentTime;
    }
  }, [playerState.currentTime, playerState.audioUrl]);

  // Handle HTML5 Audio events
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setPlayerState(prev => ({
        ...prev,
        currentTime: audio.currentTime
      }));
    };

    const handleLoadedMetadata = () => {
      console.log('[HTML5-AUDIO] Loaded metadata, duration:', audio.duration);
      setPlayerState(prev => {
        const newState = {
          ...prev,
          duration: audio.duration || 0
        };
        
        // Check if we should auto-play immediately after metadata loads
        console.log('[HTML5-AUDIO] Checking auto-play conditions on metadata load:', {
          isPlaying: newState.isPlaying,
          audioPaused: audio.paused,
          hasAudioUrl: !!newState.audioUrl,
          userInteracted: userInteracted,
          shouldAutoPlay: newState.isPlaying && audio.paused && !!newState.audioUrl && userInteracted
        });
        
        if (newState.isPlaying && audio.paused && newState.audioUrl && userInteracted) {
          console.log('[HTML5-AUDIO] Attempting auto-play after metadata load');
          // Use setTimeout to allow React to finish the state update
          setTimeout(() => {
            audio.play().then(() => {
              console.log('[HTML5-AUDIO] Auto-play successful!');
            }).catch(error => {
              console.error('[HTML5-AUDIO] Auto-play failed:', error);
              console.log('[HTML5-AUDIO] Click anywhere on the page to start playback');
            });
          }, 10);
        } else {
          console.log('[HTML5-AUDIO] Auto-play conditions not met - not attempting auto-play');
          if (!userInteracted) {
            console.log('[HTML5-AUDIO] User has not interacted with page yet - auto-play blocked by browser');
          }
        }
        
        return newState;
      });
    };

    const handleEnded = () => {
      console.log('[HTML5-AUDIO] Track ended, auto-advancing to next track');
      console.log('[HTML5-AUDIO] Shuffle mode:', playerState.isShuffled);
      
      if (playerState.isShuffled) {
        // For shuffle mode, we'll fetch a random track
        console.log('[HTML5-AUDIO] Shuffle mode enabled, fetching random track');
        attemptAutoPlayRandomTrack();
      } else {
        // Sequential mode - use the next() WebSocket command
        console.log('[HTML5-AUDIO] Sequential mode, advancing to next track');
        next();
      }
    };

    const handleError = (e: Event) => {
      console.error('[HTML5-AUDIO] Audio error:', e);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [next, playerState.isShuffled, attemptAutoPlayRandomTrack, userInteracted]);

  // Handle connection errors
  useEffect(() => {
    if (error) {
      console.error('WebSocket error:', error);
    }
  }, [error]);

  // Handle user interaction to enable auto-play with localStorage persistence
  useEffect(() => {
    const handleUserInteraction = () => {
      if (!userInteracted) {
        console.log('[USER-INTERACTION] 🎉 Fresh user interaction detected - enabling auto-play permanently');
        setUserInteracted(true);
        
        // Mark as interacted for this session and hide prompt
        setShowInteractionPrompt(false);
        
        // If we have a track loaded and should be playing, start it now
        const audio = audioRef.current;
        if (audio && playerState.isPlaying && audio.paused && playerState.audioUrl) {
          console.log('[USER-INTERACTION] 🎵 Starting delayed auto-play after user interaction');
          audio.play().then(() => {
            console.log('[USER-INTERACTION] ✅ Delayed auto-play successful!');
          }).catch(error => {
            console.error('[USER-INTERACTION] ❌ Delayed auto-play failed:', error);
          });
        }
      }
    };

    // Don't add listeners if user has already interacted in this session
    if (userInteracted) {
      console.log('[USER-INTERACTION] ✅ User has interacted in this session - auto-play enabled');
      return;
    }
    
    console.log('[USER-INTERACTION] ⏳ Waiting for user interaction to enable auto-play...');

    // Add multiple event listeners to catch user interaction
    const events = ['click', 'keydown', 'touchstart', 'mousedown'];
    
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true, passive: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction);
      });
    };
  }, [userInteracted, playerState.isPlaying, playerState.audioUrl]);


  // Enhanced auto-play functionality with localStorage user interaction support
  useEffect(() => {
    let autoPlayAttempted = false;
    
    const attemptAutoPlay = async () => {
      console.log('[AUTO-PLAY] 🎧 Starting auto-play check...', {
        isConnected,
        autoPlayAttempted,
        hasCurrentTrack: !!playerState.currentTrack,
        connectionStatus,
        userInteracted,
        userInteractedSource: userInteracted ? 'localStorage or current session' : 'none'
      });
      
      // Wait for WebSocket connection before attempting auto-play
      if (!isConnected) {
        console.log('[AUTO-PLAY] ⏳ Not connected to WebSocket, waiting for connection...');
        return;
      }
      
      if (autoPlayAttempted) {
        console.log('[AUTO-PLAY] ✅ Skipping: Auto-play already attempted');
        return;
      }
      
      if (playerState.currentTrack) {
        console.log('[AUTO-PLAY] ✅ Skipping: Track already loaded:', playerState.currentTrack);
        return;
      }
      
      autoPlayAttempted = true;
      console.log('[AUTO-PLAY] 🚀 Starting auto-play sequence...');
      
      try {
        console.log('[AUTO-PLAY] 🌐 Fetching first track from API...');
        console.log('[AUTO-PLAY] 🔗 API URL:', 'http://127.0.0.1:8000/api/tracks?limit=1');
        
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        let response;
        try {
          // Try to get the first available track from the library
          response = await fetch('http://127.0.0.1:8000/api/tracks?limit=1', {
            method: 'GET',
            headers: {
              'Accept': 'application/json',
              'Content-Type': 'application/json',
            },
            signal: controller.signal
          });

          clearTimeout(timeoutId);
          console.log('[AUTO-PLAY] 📨 API response received!');
          console.log('[AUTO-PLAY] 📄 Response status:', response.status);
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError.name === 'AbortError') {
            console.error('[AUTO-PLAY] ⏰ API request timed out after 5 seconds');
            return;
          } else {
            console.error('[AUTO-PLAY] ❌ Fetch error:', fetchError);
            return;
          }
        }

        if (response.ok) {
          console.log('[AUTO-PLAY] ✅ Response OK, parsing JSON...');
          const tracks = await response.json();
          console.log('[AUTO-PLAY] 📄 API response data:', tracks);
          console.log('[AUTO-PLAY] 📊 Number of tracks found:', Array.isArray(tracks) ? tracks.length : 'Not an array');
          
          if (Array.isArray(tracks) && tracks.length > 0) {
            const firstTrack = tracks[0];
            console.log('[AUTO-PLAY] 🎵 Processing first track:', firstTrack);
            
            const trackInfo: TrackInfo = {
              id: firstTrack.id || '',
              title: firstTrack.title || 'Unknown Title',
              artist: firstTrack.artist || 'Unknown Artist',
              album: firstTrack.album?.title || 'Unknown Album',
              artworkUrl: firstTrack.artwork_url || firstTrack.artworkUrl || null,
            };
            
            console.log('[AUTO-PLAY] 🎤 TrackInfo created:', trackInfo);
            
            // Generate audio URL directly without WebSocket - extract relative path from the music directory
            const musicDirPath = '/Users/7racker/Documents/9layer/music/';
            const audioUrl = `/api/audio/${firstTrack.file_path.replace(musicDirPath, '')}`;
            console.log('[AUTO-PLAY] 🔗 Generated audio URL:', audioUrl);
            
            // Update player state directly
            console.log('[AUTO-PLAY] 🔄 About to update player state with auto-play track');
            console.log('[AUTO-PLAY] 📝 User interaction status:', userInteracted ? 'Ready for immediate playback' : 'Will show interaction prompt');
            
            setPlayerState(prev => {
              const newState = {
                ...prev,
                currentTrack: trackInfo,
                audioUrl,
                isPlaying: true
              };
              console.log('[AUTO-PLAY] ✅ Player state updated - track loaded and ready');
              return newState;
            });
            
            if (userInteracted) {
              console.log('[AUTO-PLAY] 🎵 User has interacted this session - audio will start automatically');
            } else {
              console.log('[AUTO-PLAY] ⏳ User has not interacted this session - will show prompt');
              setShowInteractionPrompt(true);
            }
          } else {
            console.warn('[AUTO-PLAY] ⚠️ No tracks available for auto-play');
          }
        } else {
          console.error('[AUTO-PLAY] ❌ API request failed');
          console.error('[AUTO-PLAY] 📄 Status:', response.status, response.statusText);
          const errorText = await response.text();
          console.error('[AUTO-PLAY] 📄 Error response body:', errorText);
        }
      } catch (err) {
        console.error('[AUTO-PLAY] ❌ Auto-play failed with error:', err);
      }
    };

    // Shorter delay since we now have better connection management
    console.log('[AUTO-PLAY] ⏰ Scheduling auto-play attempt in 2 seconds...');
    const timeoutId = setTimeout(attemptAutoPlay, 2000);
    
    return () => {
      console.log('[AUTO-PLAY] 🧹 Cleaning up auto-play timeout');
      clearTimeout(timeoutId);
    };
  }, [isConnected, playerState.currentTrack, userInteracted, connectionStatus]);

  // Debug connection status changes
  useEffect(() => {
    console.log('[CONNECTION-DEBUG] Connection status changed to:', connectionStatus);
    console.log('[CONNECTION-DEBUG] Is connected:', isConnected);
  }, [connectionStatus, isConnected]);

  // Enhanced connection recovery for page refresh stability
  useEffect(() => {
    let reconnectTimer: NodeJS.Timeout | null = null;
    let heartbeatTimer: NodeJS.Timeout | null = null;
    
    const attemptReconnection = (reason: string) => {
      console.log(`[CONNECTION-RECOVERY] Attempting reconnection due to: ${reason}`);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      
      reconnectTimer = setTimeout(() => {
        console.log('[CONNECTION-RECOVERY] Executing reconnection...');
        reconnect();
      }, 500);
    };

    const handlePageLoad = () => {
      console.log('[CONNECTION-RECOVERY] Page loaded, connection status:', connectionStatus);
      if (connectionStatus !== 'connected' && connectionStatus !== 'connecting') {
        attemptReconnection('page load with non-connected status');
      }
    };

    const handleVisibilityChange = () => {
      if (!document.hidden && connectionStatus !== 'connected') {
        console.log('[CONNECTION-RECOVERY] Tab became visible, checking connection...');
        attemptReconnection('tab visibility change');
      }
    };

    const handleOnline = () => {
      console.log('[CONNECTION-RECOVERY] Network came back online');
      if (connectionStatus !== 'connected') {
        attemptReconnection('network reconnection');
      }
    };

    // Aggressive reconnection check - runs every 3 seconds if disconnected
    const startHeartbeat = () => {
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      
      heartbeatTimer = setInterval(() => {
        if (connectionStatus === 'disconnected') {
          console.log('[CONNECTION-RECOVERY] Heartbeat detected disconnection - attempting reconnection');
          attemptReconnection('heartbeat check');
        }
      }, 3000);
    };

    // Initial checks
    handlePageLoad();
    startHeartbeat();

    // Event listeners
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
    };
  }, [connectionStatus, reconnect]);

  return (
    <>
      {/* Hidden HTML5 Audio Element */}
      <audio
        ref={audioRef}
        preload="metadata"
        style={{ display: 'none' }}
      />
      
      {/* Desktop Layout */}
      <div className="hidden md:flex min-h-screen bg-white">
        {/* Search Sidebar */}
        <SearchSidebar
          isOpen={isSearchOpen}
          onClose={() => setIsSearchOpen(false)}
          onTrackSelect={handleTrackSelect}
          disabled={!isConnected}
        />

        {/* Main Player Area */}
        <div className={cn(
          "flex-1 flex flex-col transition-all duration-300",
          isSearchOpen ? "ml-[50%]" : "ml-0"
        )}>
          {/* Header */}
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setIsSearchOpen(!isSearchOpen)}
              >
                <Search className="h-4 w-4" />
              </Button>
              <h1 className="text-lg font-semibold">9layer</h1>
            </div>
            
            {/* Connection Status */}
            <div className="flex items-center space-x-2">
              {connectionStatus === 'connected' ? (
                <div className="flex items-center space-x-1">
                  <Wifi className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-green-600">Connected</span>
                </div>
              ) : connectionStatus === 'connecting' ? (
                <div className="flex items-center space-x-1">
                  <Wifi className="h-4 w-4 text-yellow-500 animate-pulse" />
                  <span className="text-xs text-yellow-600">Connecting...</span>
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <WifiOff className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-red-600">Disconnected</span>
                  <Button variant="outline" size="sm" onClick={reconnect}>
                    Reconnect
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Main Content - Horizontal Layout */}
          <div className="flex-1 flex items-center justify-center p-8">
            <div className="w-full max-w-6xl space-y-8">
              {/* Track Info Row */}
              <div className="flex items-center space-x-8">
                {/* Album Art */}
                <div className="flex-shrink-0">
                  <AlbumArt 
                    track={playerState.currentTrack} 
                    className="w-32 h-32 rounded-lg shadow-lg"
                  />
                </div>
                
                {/* Track Info */}
                <div className="flex-1 min-w-0">
                  <h2 className="text-3xl font-bold truncate">
                    {playerState.currentTrack?.title || 'No track playing'}
                  </h2>
                  <p className="text-gray-600 text-xl truncate">
                    {playerState.currentTrack?.artist || 'Select a track to start playing'}
                  </p>
                  {playerState.currentTrack?.album && (
                    <p className="text-gray-500 truncate">
                      {playerState.currentTrack.album}
                    </p>
                  )}
                </div>

                {/* Volume Control */}
                <div className="flex items-center space-x-2 flex-shrink-0">
                  <Volume2 className="h-4 w-4 text-gray-600" />
                  <Slider
                    value={[playerState.volume * 100]}
                    max={100}
                    step={1}
                    onValueChange={handleVolumeChange}
                    disabled={!isConnected}
                    className="w-24"
                  />
                </div>
              </div>

              {/* Waveform Timeline - Full Width */}
              <WaveformTimeline 
                audioUrl={playerState.audioUrl}
                currentTime={playerState.currentTime}
                duration={playerState.duration}
                onSeek={handleSeek}
                disabled={!isConnected}
                className="w-full"
              />

              {/* Player Controls Row */}
              <div className="flex items-center justify-center space-x-8">
                <Toggle
                  pressed={playerState.isShuffled}
                  onPressedChange={handleShuffleToggle}
                  variant="outline"
                  disabled={!isConnected}
                  aria-label="Toggle shuffle"
                >
                  <Shuffle className="h-4 w-4" />
                </Toggle>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    console.log('[UI] Previous button clicked');
                    previous();
                  }}
                  className={cn(
                    "h-12 w-12 cursor-pointer hover:bg-gray-100 transition-colors",
                    !isConnected && "opacity-70"
                  )}
                  title={!isConnected ? "Reconnecting..." : "Previous track"}
                >
                  <SkipBack className="h-5 w-5" />
                </Button>

                <Button
                  size="icon"
                  onClick={() => {
                    console.log('[UI] Play/Pause button clicked');
                    if (playerState.isPlaying) {
                      pause();
                    } else {
                      play();
                    }
                  }}
                  className={cn(
                    "h-16 w-16 rounded-full cursor-pointer transition-all duration-200",
                    "hover:scale-105 hover:shadow-lg",
                    !isConnected && "opacity-70"
                  )}
                  title={!isConnected ? "Reconnecting..." : playerState.isPlaying ? "Pause" : "Play"}
                >
                  {playerState.isPlaying ? (
                    <Pause className="h-6 w-6" />
                  ) : (
                    <Play className="h-6 w-6" />
                  )}
                </Button>

                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => {
                    console.log('[UI] Next button clicked');
                    next();
                  }}
                  className={cn(
                    "h-12 w-12 cursor-pointer hover:bg-gray-100 transition-colors",
                    !isConnected && "opacity-70"
                  )}
                  title={!isConnected ? "Reconnecting..." : "Next track"}
                >
                  <SkipForward className="h-5 w-5" />
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Layout */}
      <div className="md:hidden min-h-screen bg-white flex flex-col">
        {/* Mobile Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setIsSearchOpen(!isSearchOpen)}
          >
            <Search className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">9layer</h1>
          <div className="flex items-center space-x-2">
            {connectionStatus === 'connected' ? (
              <Wifi className="h-4 w-4 text-green-500" />
            ) : connectionStatus === 'connecting' ? (
              <Wifi className="h-4 w-4 text-yellow-500 animate-pulse" />
            ) : (
              <div className="flex items-center space-x-1">
                <WifiOff className="h-4 w-4 text-red-500" />
                <Button variant="outline" size="sm" onClick={reconnect}>
                  Reconnect
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Mobile Search Sidebar */}
        {isSearchOpen && (
          <div className="absolute inset-0 z-50 bg-white">
            <SearchSidebar
              isOpen={isSearchOpen}
              onClose={() => setIsSearchOpen(false)}
              onTrackSelect={handleTrackSelect}
              disabled={!isConnected}
            />
          </div>
        )}

        {/* Mobile Player Content - Vertical Stack */}
        <div className="flex-1 flex flex-col p-6 space-y-8">
          {/* Album Art - Large and Centered */}
          <div className="flex justify-center pt-8">
            <AlbumArt 
              track={playerState.currentTrack} 
              className="w-72 h-72 rounded-xl shadow-lg"
            />
          </div>

          {/* Track Info - Centered */}
          <div className="text-center space-y-2 px-4">
            <h2 className="text-2xl font-bold truncate">
              {playerState.currentTrack?.title || 'No track playing'}
            </h2>
            <p className="text-gray-600 text-lg truncate">
              {playerState.currentTrack?.artist || 'Select a track to start playing'}
            </p>
            {playerState.currentTrack?.album && (
              <p className="text-gray-500 truncate">
                {playerState.currentTrack.album}
              </p>
            )}
          </div>

          {/* User Interaction Prompt - smart prompt for session-based interaction */}
          {showInteractionPrompt && (
            <div className="px-4 py-2">
              <div 
                className="bg-gradient-to-r from-purple-100 to-blue-100 border border-purple-200 rounded-lg p-3 text-center cursor-pointer hover:from-purple-200 hover:to-blue-200 transition-colors"
                onClick={() => {
                  console.log('[INTERACTION-PROMPT] Prompt clicked - enabling audio');
                  setUserInteracted(true);
                  setShowInteractionPrompt(false);
                }}
              >
                <p className="text-sm text-purple-800 font-medium mb-1">
                  🎵 Click here to start music!
                </p>
                <p className="text-xs text-purple-600">
                  Browser requires interaction to enable auto-play
                </p>
              </div>
            </div>
          )}

          {/* Waveform Timeline - Full Width */}
          <div className="px-4">
            <WaveformTimeline 
              audioUrl={playerState.audioUrl}
              currentTime={playerState.currentTime}
              duration={playerState.duration}
              onSeek={handleSeek}
              disabled={!isConnected}
              className="w-full"
            />
          </div>

          {/* Mobile Controls - Optimized Layout */}
          <div className="space-y-6 px-4">
            {/* Primary Controls */}
            <div className="flex items-center justify-center space-x-12">
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  console.log('[UI-MOBILE] Previous button clicked');
                  previous();
                }}
                className={cn(
                  "h-14 w-14 cursor-pointer hover:bg-gray-100 transition-colors",
                  !isConnected && "opacity-70"
                )}
                title={!isConnected ? "Reconnecting..." : "Previous track"}
              >
                <SkipBack className="h-6 w-6" />
              </Button>

              <Button
                size="icon"
                onClick={() => {
                  console.log('[UI-MOBILE] Play/Pause button clicked');
                  if (playerState.isPlaying) {
                    pause();
                  } else {
                    play();
                  }
                }}
                className={cn(
                  "h-20 w-20 rounded-full cursor-pointer transition-all duration-200",
                  "hover:scale-105 hover:shadow-lg",
                  !isConnected && "opacity-70"
                )}
                title={!isConnected ? "Reconnecting..." : playerState.isPlaying ? "Pause" : "Play"}
              >
                {playerState.isPlaying ? (
                  <Pause className="h-8 w-8" />
                ) : (
                  <Play className="h-8 w-8" />
                )}
              </Button>

              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  console.log('[UI-MOBILE] Next button clicked');
                  next();
                }}
                className={cn(
                  "h-14 w-14 cursor-pointer hover:bg-gray-100 transition-colors",
                  !isConnected && "opacity-70"
                )}
                title={!isConnected ? "Reconnecting..." : "Next track"}
              >
                <SkipForward className="h-6 w-6" />
              </Button>
            </div>

            {/* Secondary Controls */}
            <div className="flex items-center justify-between">
              <Toggle
                pressed={playerState.isShuffled}
                onPressedChange={handleShuffleToggle}
                variant="outline"
                disabled={!isConnected}
                aria-label="Toggle shuffle"
                className="h-10 w-10"
              >
                <Shuffle className="h-5 w-5" />
              </Toggle>

              {/* Volume Control */}
              <div className="flex items-center space-x-3">
                <Volume2 className="h-5 w-5 text-gray-600" />
                <Slider
                  value={[playerState.volume * 100]}
                  max={100}
                  step={1}
                  onValueChange={handleVolumeChange}
                  disabled={!isConnected}
                  className="w-32"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Player;
