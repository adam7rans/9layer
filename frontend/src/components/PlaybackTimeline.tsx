'use client';

import { useState } from 'react';

interface TimelineSegment {
  startPosition: number;
  endPosition: number;
  duration: number;
  startPercentage: number;
  endPercentage: number;
}

interface PlaybackTimelineProps {
  segments: TimelineSegment[];
  trackDuration: number;
  className?: string;
  height?: number;
}

const PlaybackTimeline = ({ 
  segments, 
  trackDuration, 
  className = '',
  height = 20 
}: PlaybackTimelineProps) => {
  const [hoveredSegment, setHoveredSegment] = useState<TimelineSegment | null>(null);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  // Format time as mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Merge overlapping segments for cleaner visualization
  const mergeSegments = (segments: TimelineSegment[]): TimelineSegment[] => {
    if (segments.length === 0) return [];
    
    // Sort segments by start position
    const sorted = [...segments].sort((a, b) => a.startPosition - b.startPosition);
    const merged: TimelineSegment[] = [];
    let current = sorted[0];
    
    for (let i = 1; i < sorted.length; i++) {
      const next = sorted[i];
      
      // If segments overlap or are adjacent, merge them
      if (current.endPosition >= next.startPosition) {
        current = {
          ...current,
          endPosition: Math.max(current.endPosition, next.endPosition),
          endPercentage: Math.max(current.endPercentage, next.endPercentage),
          duration: current.duration + next.duration
        };
      } else {
        merged.push(current);
        current = next;
      }
    }
    
    merged.push(current);
    return merged;
  };

  const mergedSegments = mergeSegments(segments);

  const handleMouseMove = (event: React.MouseEvent<SVGRectElement>, segment: TimelineSegment) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setMousePosition({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    });
    setHoveredSegment(segment);
  };

  return (
    <div className={`relative ${className}`}>
      <svg
        width="100%"
        height={height}
        className="border rounded"
        style={{ backgroundColor: '#374151' }} // Gray-700
      >
        {/* Full track background */}
        <rect
          x="0"
          y="0"
          width="100%"
          height={height}
          fill="#374151"
          stroke="#4B5563"
          strokeWidth="1"
          rx="2"
        />
        
        {/* Played segments */}
        {mergedSegments.map((segment, index) => (
          <rect
            key={index}
            x={`${segment.startPercentage}%`}
            y="2"
            width={`${segment.endPercentage - segment.startPercentage}%`}
            height={height - 4}
            fill="#3B82F6" // Blue-500
            rx="1"
            className="cursor-pointer hover:fill-blue-400 transition-colors"
            onMouseEnter={(e) => handleMouseMove(e, segment)}
            onMouseMove={(e) => handleMouseMove(e, segment)}
            onMouseLeave={() => setHoveredSegment(null)}
          />
        ))}
        
        {/* Time markers (every 25%) */}
        {[25, 50, 75].map((percentage) => (
          <line
            key={percentage}
            x1={`${percentage}%`}
            y1="0"
            x2={`${percentage}%`}
            y2={height}
            stroke="#6B7280"
            strokeWidth="1"
            opacity="0.3"
          />
        ))}
      </svg>

      {/* Tooltip */}
      {hoveredSegment && (
        <div
          className="absolute z-10 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg border border-gray-600"
          style={{
            left: mousePosition.x + 10,
            top: mousePosition.y - 30,
            whiteSpace: 'nowrap'
          }}
        >
          <div>
            {formatTime(hoveredSegment.startPosition)} - {formatTime(hoveredSegment.endPosition)}
          </div>
          <div className="text-gray-300">
            Duration: {formatTime(hoveredSegment.duration)}
          </div>
        </div>
      )}

      {/* Time labels */}
      <div className="flex justify-between text-xs text-gray-400 mt-1">
        <span>0:00</span>
        <span>{formatTime(trackDuration)}</span>
      </div>
    </div>
  );
};

export default PlaybackTimeline;