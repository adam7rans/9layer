'use client';

import { useState, useEffect, useCallback } from 'react';
import usePlayerSocket from '@/hooks/usePlayerSocket';
import Timeline from './Timeline';
import SearchBox from './SearchBox';
import AlbumArt from './AlbumArt';
import { TrackInfo, PlayerState as PlayerStateType } from '@/types/websocket';

interface PlayerState extends PlayerStateType {
  currentTrack: TrackInfo | null;
}

const Player = () => {
  const [playerState, setPlayerState] = useState<PlayerState>({
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    currentTrack: null,
    volume: 1.0, // Default volume to 100%
  });

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

  const handleSeek = useCallback((time: number) => {
    if (!isConnected) return;
    
    // Update local state immediately for responsive UI
    setPlayerState(prev => ({
      ...prev,
      currentTime: time
    }));
    
    // Send seek command to backend
    seek(time);
  }, [isConnected, seek]);

  // Handle track selection from search
  const handleTrackSelect = useCallback((track: TrackInfo) => {
    if (!isConnected) return;
    
    console.log('Playing track:', track);
    playTrack({ trackId: track.id });
  }, [isConnected, playTrack]);

  // Handle player state updates from WebSocket
  useEffect(() => {
    const handleStateUpdate = (update: Partial<PlayerState>) => {
      console.debug('Received player state update:', update);
      setPlayerState(prev => ({
        ...prev,
        ...update
      }));
    };

    // Subscribe to player state updates
    const unsubscribe = addEventListener(handleStateUpdate);
    
    // Initial state fetch - the WebSocket server will send the initial state on connection
    // No need to explicitly request it

    // Clean up the event listener when the component unmounts or dependencies change
    return () => {
      unsubscribe();
    };
  }, [addEventListener, isConnected]);

  // Handle connection errors
  useEffect(() => {
    if (error) {
      console.error('WebSocket error:', error);
      // You might want to show an error toast here
    }
  }, [error]);

  // Format time in MM:SS format
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Render player UI
  return (
    <div className="space-y-4 p-4 max-w-md mx-auto bg-white rounded-lg shadow">
      {/* Search Box */}
      <div className="mb-4">
        <SearchBox 
          onTrackSelect={handleTrackSelect} 
          disabled={!isConnected}
        />
      </div>
      
      {/* Album Art */}
      <div className="flex justify-center mb-4">
        <AlbumArt 
          track={playerState.currentTrack} 
          className="w-64 h-64 md:w-80 md:h-80"
        />
      </div>
      
      {/* Connection status */}
      <div className={`text-sm font-medium mb-4 ${isConnected ? 'text-green-600' : 'text-red-600'}`}>
        {isConnected ? 'Connected' : 'Disconnected'}
        {error && (
          <span className="ml-2 text-xs text-red-500">
            {error.message}
          </span>
        )}
        {!isConnected && (
          <button 
            onClick={reconnect} 
            className="ml-2 px-2 py-1 text-xs bg-gray-100 rounded hover:bg-gray-200"
            title="Reconnect to player"
          >
            ↻ Reconnect
          </button>
        )}
      </div>

      {/* Now playing info */}
      <div className="text-center mb-4">
        <h2 className="text-xl font-semibold">
          {playerState.currentTrack?.title || 'No track playing'}
        </h2>
        <p className="text-gray-600">
          {playerState.currentTrack?.artist || ''}
          {playerState.currentTrack?.album && ` • ${playerState.currentTrack.album}`}
        </p>
      </div>

      {/* Timeline */}
      <div className="mb-2">
        <Timeline 
          currentTime={playerState.currentTime}
          duration={playerState.duration}
          onSeek={handleSeek}
          disabled={!isConnected}
        />
        <div className="flex justify-between text-xs text-gray-500 mt-1">
          <span>{formatTime(playerState.currentTime)}</span>
          <span>{formatTime(playerState.duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-center space-x-4">
        <button 
          onClick={previous}
          disabled={!isConnected}
          className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
        >
          ⏮️
        </button>
        
        <button 
          onClick={playerState.isPlaying ? pause : play}
          disabled={!isConnected}
          className="p-4 rounded-full bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {playerState.isPlaying ? '⏸️' : '▶️'}
        </button>
        
        <button 
          onClick={next}
          disabled={!isConnected}
          className="p-2 rounded-full bg-gray-200 hover:bg-gray-300 disabled:opacity-50"
        >
          ⏭️
        </button>
      </div>

      {/* Volume control */}
      <div className="flex items-center justify-center space-x-2 pt-2">
        <span className="text-gray-600">🔈</span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={playerState.volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className="w-32"
          disabled={!isConnected}
        />
      </div>
    </div>
  );
};

export default Player;
