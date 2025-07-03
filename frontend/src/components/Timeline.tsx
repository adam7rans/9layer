'use client';

import { useState, useRef, useEffect } from 'react';
import usePlayerSocket from '@/hooks/usePlayerSocket';

interface TimelineProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  className?: string;
  disabled?: boolean;
}

export default function Timeline({ 
  currentTime, 
  duration, 
  onSeek, 
  className = '',
  disabled = false
}: TimelineProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [dragPosition, setDragPosition] = useState(0);
  const timelineRef = useRef<HTMLDivElement>(null);
  const { connectionStatus } = usePlayerSocket();
  
  // Derived state for connection status
  const isConnected = connectionStatus === 'connected';

  // Update drag position when currentTime changes (unless user is dragging)
  useEffect(() => {
    if (!isDragging) {
      setDragPosition(duration > 0 ? (currentTime / duration) * 100 : 0);
    }
  }, [currentTime, duration, isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!timelineRef.current || disabled) return;
    
    setIsDragging(true);
    updatePosition(e);
    
    const handleMouseMove = (e: MouseEvent) => {
      updatePosition(e as unknown as React.MouseEvent);
    };
    
    const handleMouseUp = () => {
      setIsDragging(false);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      
      // Only send seek command when user releases the drag
      if (timelineRef.current) {
        const rect = timelineRef.current.getBoundingClientRect();
        const position = ((dragPosition / 100) * duration) || 0;
        onSeek(position);
      }
    };
    
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (!timelineRef.current || disabled) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const clickPosition = Math.max(0, Math.min(1, (e.touches[0].clientX - rect.left) / rect.width));
    const seekTime = clickPosition * duration;
    onSeek(seekTime);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const clickPosition = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const seekTime = clickPosition * duration;
    onSeek(seekTime);
  };
  
  const updatePosition = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    
    const rect = timelineRef.current.getBoundingClientRect();
    const position = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setDragPosition(position * 100);
  };

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  const timelineClasses = [
    'relative',
    'h-2',
    'bg-gray-200',
    'rounded-full',
    disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer group',
    className
  ].filter(Boolean).join(' ');

  return (
    <div className={`w-full flex items-center gap-3 ${className}`}>
      <span className="text-xs text-gray-400 w-10 text-right">
        {formatTime(isDragging ? (dragPosition / 100) * duration : currentTime)}
      </span>
      <div 
        ref={timelineRef}
        className={timelineClasses}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={handleClick}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
        aria-disabled={disabled}
      >
        <div 
          className="h-full bg-blue-500 rounded-full absolute left-0 top-0"
          style={{ width: `${isDragging ? dragPosition : (duration > 0 ? (currentTime / duration) * 100 : 0)}%` }}
        />
        <div 
          className="h-full w-3 bg-white rounded-full absolute top-1/2 -translate-y-1/2 -translate-x-1/2 shadow-md"
          style={{ left: `${isDragging ? dragPosition : (duration > 0 ? (currentTime / duration) * 100 : 0)}%` }}
        />
      </div>
      
      <span className="text-xs text-gray-400 w-10">
        {formatTime(duration)}
      </span>
    </div>
  );
}
