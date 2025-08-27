'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useWavesurfer } from '@wavesurfer/react';
import { cn } from '@/lib/utils';

interface WaveformTimelineProps {
  audioUrl?: string;
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
  className?: string;
}

export default function WaveformTimeline({
  audioUrl,
  currentTime,
  duration,
  onSeek,
  disabled = false,
  className
}: WaveformTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const lastSyncTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number>();

  const { wavesurfer, isReady } = useWavesurfer({
    container: containerRef,
    height: 80,
    waveColor: '#9333ea',
    progressColor: '#7c3aed',
    cursorColor: '#7c3aed',
    barWidth: 2,
    barRadius: 3,
    responsive: true,
    interact: !disabled,
    dragToSeek: !disabled,
    normalize: true,
    backend: 'WebAudio',
  });

  // Load audio URL when it changes
  useEffect(() => {
    if (!wavesurfer || !audioUrl) return;

    const loadAudio = async () => {
      try {
        setIsLoading(true);
        console.log('[WAVEFORM] Loading audio:', audioUrl);
        await wavesurfer.load(`http://127.0.0.1:8000${audioUrl}`);
        setIsLoading(false);
        console.log('[WAVEFORM] Audio loaded successfully');
      } catch (error) {
        console.error('[WAVEFORM] Error loading audio:', error);
        setIsLoading(false);
      }
    };

    loadAudio();
  }, [wavesurfer, audioUrl]);

  // Handle seeking when user clicks on waveform
  useEffect(() => {
    if (!wavesurfer || disabled) return;

    const handleSeek = (currentTime: number) => {
      console.log('[WAVEFORM] Seek to:', currentTime);
      onSeek(currentTime);
    };

    wavesurfer.on('interaction', handleSeek);

    return () => {
      wavesurfer.un('interaction', handleSeek);
    };
  }, [wavesurfer, onSeek, disabled]);

  // Smooth animation function for interpolating between sync points
  const smoothUpdate = useCallback(() => {
    if (!wavesurfer || !isReady || disabled) return;
    
    const now = performance.now();
    const timeSinceLastSync = (now - lastSyncTimeRef.current) / 1000;
    
    // Interpolate position based on time elapsed since last sync
    if (timeSinceLastSync < 1) { // Only interpolate for up to 1 second
      const interpolatedTime = currentTime + (timeSinceLastSync * 0.1); // Slow interpolation
      const targetPosition = duration > 0 ? interpolatedTime / duration : 0;
      
      if (targetPosition >= 0 && targetPosition <= 1) {
        wavesurfer.seekTo(targetPosition);
      }
    }
    
    animationFrameRef.current = requestAnimationFrame(smoothUpdate);
  }, [wavesurfer, isReady, disabled, currentTime, duration]);

  // Sync current time with external player state
  useEffect(() => {
    if (!wavesurfer || !isReady || disabled) return;

    // Get current wavesurfer time
    const wavesurferTime = wavesurfer.getCurrentTime();
    const timeDiff = Math.abs(currentTime - wavesurferTime);
    
    // Use much smaller threshold for smoother updates
    if (timeDiff > 0.1) {
      console.log('[WAVEFORM] Syncing time:', currentTime, 'diff:', timeDiff.toFixed(2));
      wavesurfer.seekTo(duration > 0 ? currentTime / duration : 0);
      lastSyncTimeRef.current = performance.now();
      
      // Start smooth animation if not already running
      if (!animationFrameRef.current) {
        animationFrameRef.current = requestAnimationFrame(smoothUpdate);
      }
    }
  }, [wavesurfer, isReady, currentTime, duration, disabled, smoothUpdate]);

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
    };
  }, []);

  const formatTime = (time: number): string => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className={cn('w-full', className)}>
      {/* Time Display */}
      <div className="flex justify-between items-center mb-2 text-sm text-gray-600">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>

      {/* Waveform Container */}
      <div 
        ref={containerRef}
        className={cn(
          'w-full rounded-md bg-gray-100 relative overflow-hidden',
          disabled && 'opacity-50 cursor-not-allowed',
          isLoading && 'animate-pulse'
        )}
        style={{ height: '80px' }}
      >
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-100 bg-opacity-75">
            <div className="text-sm text-gray-500">Loading waveform...</div>
          </div>
        )}
        
        {/* No Audio Message */}
        {!audioUrl && !isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-sm text-gray-400">No audio loaded</div>
          </div>
        )}
      </div>

      {/* Debug Info (only in development) */}
      {process.env.NODE_ENV === 'development' && (
        <div className="mt-2 text-xs text-gray-400">
          Ready: {isReady ? '✓' : '✗'} | 
          Loading: {isLoading ? '✓' : '✗'} | 
          Audio: {audioUrl ? '✓' : '✗'} |
          Time: {currentTime.toFixed(1)}s / {duration.toFixed(1)}s
        </div>
      )}
    </div>
  );
}