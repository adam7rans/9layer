'use client';

import { useState, useCallback } from 'react';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

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
  const [tempValue, setTempValue] = useState(0);

  const formatTime = (seconds: number): string => {
    if (isNaN(seconds)) return '0:00';
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  const handleValueChange = useCallback((value: number[]) => {
    const newValue = value[0];
    setTempValue(newValue);
    setIsDragging(true);
  }, []);

  const handleValueCommit = useCallback((value: number[]) => {
    const seekTime = value[0];
    onSeek(seekTime);
    setIsDragging(false);
  }, [onSeek]);

  const currentValue = isDragging ? tempValue : currentTime;
  const maxValue = Math.max(duration, 1); // Prevent division by zero

  return (
    <div className={cn("w-full flex items-center gap-3", className)}>
      <span className="text-xs text-gray-500 w-12 text-right font-mono">
        {formatTime(currentValue)}
      </span>
      
      <div className="flex-1">
        <Slider
          value={[currentValue]}
          max={maxValue}
          step={1}
          onValueChange={handleValueChange}
          onValueCommit={handleValueCommit}
          disabled={disabled}
          className="w-full"
        />
      </div>
      
      <span className="text-xs text-gray-500 w-12 font-mono">
        {formatTime(duration)}
      </span>
    </div>
  );
}
