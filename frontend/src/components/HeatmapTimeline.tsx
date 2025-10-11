'use client';

import { useState, useEffect } from 'react';

interface HeatmapBucket {
  startPosition: number;
  endPosition: number;
  playCount: number;
  intensity: number; // 0-1 normalized value
}

interface HeatmapTimelineProps {
  trackId: string;
  trackDuration: number;
  currentPosition?: number;
  className?: string;
  height?: number;
  onSeek?: (position: number) => void;
}

const HeatmapTimeline = ({ 
  trackId,
  trackDuration, 
  currentPosition = 0,
  className = '',
  height = 40,
  onSeek
}: HeatmapTimelineProps) => {
  const [heatmapData, setHeatmapData] = useState<HeatmapBucket[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hoveredPosition, setHoveredPosition] = useState<number | null>(null);

  // Fetch heatmap data
  useEffect(() => {
    const fetchHeatmap = async () => {
      try {
        setIsLoading(true);
        const response = await fetch(`http://localhost:8000/analytics/track/${trackId}/heatmap`);
        const result = await response.json();
        console.log('[HEATMAP] API Response:', result);
        
        if (result.success && result.data) {
          console.log('[HEATMAP] Buckets received:', result.data.buckets.length);
          console.log('[HEATMAP] Max plays:', result.data.maxPlays);
          console.log('[HEATMAP] Sample bucket:', result.data.buckets[0]);
          console.log('[HEATMAP] Non-zero buckets:', result.data.buckets.filter((b: HeatmapBucket) => b.playCount > 0).length);
          setHeatmapData(result.data.buckets);
        }
      } catch (error) {
        console.error('[HEATMAP] Failed to fetch heatmap:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (trackId) {
      fetchHeatmap();
    }
  }, [trackId]);

  // Format time as mm:ss
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Handle click to seek
  const handleClick = (event: React.MouseEvent<SVGElement>) => {
    if (!onSeek || trackDuration === 0) return;
    
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newPosition = percentage * trackDuration;
    
    onSeek(newPosition);
  };

  // Handle hover
  const handleMouseMove = (event: React.MouseEvent<SVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const position = percentage * trackDuration;
    
    setHoveredPosition(position);
  };

  const handleMouseLeave = () => {
    setHoveredPosition(null);
  };

  // Get color based on intensity (blue gradient, more intense = brighter)
  const getColor = (intensity: number) => {
    if (intensity === 0) return 'rgba(59, 130, 246, 0.1)'; // Very faint blue
    
    // Gradient from medium blue to bright cyan (more visible)
    const r = 59 + Math.floor((100 - 59) * intensity); 
    const g = 130 + Math.floor((200 - 130) * intensity); 
    const b = 246;
    const alpha = 0.6 + (intensity * 0.4); // 60% to 100% opacity (more visible)
    
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  };

  if (isLoading) {
    return (
      <div className={`${className}`} style={{ height: `${height}px` }}>
        <div className="w-full h-full bg-gray-700 rounded animate-pulse" />
      </div>
    );
  }

  if (heatmapData.length === 0 || trackDuration === 0) {
    return (
      <div className={`${className}`} style={{ height: `${height}px` }}>
        <svg
          width="100%"
          height={height}
          className="border border-gray-600 rounded cursor-pointer"
          style={{ backgroundColor: '#374151' }}
          onClick={handleClick}
        >
          <rect
            x="0"
            y="0"
            width="100%"
            height={height}
            fill="#374151"
          />
          <text
            x="50%"
            y="50%"
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#9CA3AF"
            fontSize="12"
          >
            No playback data yet
          </text>
        </svg>
      </div>
    );
  }

  const currentPositionPercentage = (currentPosition / trackDuration) * 100;
  const hoveredPercentage = hoveredPosition ? (hoveredPosition / trackDuration) * 100 : null;

  return (
    <div className={`relative ${className}`}>
      <svg
        width="100%"
        height={height}
        className="border border-gray-600 rounded cursor-pointer"
        style={{ backgroundColor: '#1F2937' }}
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        {/* Background */}
        <rect
          x="0"
          y="0"
          width="100%"
          height={height}
          fill="#1F2937"
        />
        
        {/* Heatmap bars (YouTube-style mountain range) */}
        {heatmapData.map((bucket, index) => {
          const xPos = (bucket.startPosition / trackDuration) * 100;
          const widthPercent = ((bucket.endPosition - bucket.startPosition) / trackDuration) * 100;
          // Make bars more visible: minimum 20% height if played at all, scale up from there
          const minVisibleHeight = bucket.playCount > 0 ? (height * 0.2) : 0;
          const barHeight = bucket.playCount > 0 
            ? Math.max(minVisibleHeight, bucket.intensity * (height - 4))
            : 0;
          
          // Skip rendering if no plays
          if (bucket.playCount === 0) return null;
          
          return (
            <rect
              key={index}
              x={`${xPos}%`}
              y={height - barHeight - 2}
              width={`${widthPercent}%`}
              height={barHeight}
              fill={getColor(bucket.intensity)}
              className="transition-opacity hover:opacity-80"
            />
          );
        })}
        
        {/* Current position indicator */}
        <line
          x1={`${currentPositionPercentage}%`}
          y1="0"
          x2={`${currentPositionPercentage}%`}
          y2={height}
          stroke="#EF4444"
          strokeWidth="2"
        />
        
        {/* Current position dot */}
        <circle
          cx={`${currentPositionPercentage}%`}
          cy={height / 2}
          r="4"
          fill="#EF4444"
        />
        
        {/* Hover indicator */}
        {hoveredPercentage !== null && (
          <line
            x1={`${hoveredPercentage}%`}
            y1="0"
            x2={`${hoveredPercentage}%`}
            y2={height}
            stroke="#9CA3AF"
            strokeWidth="1"
            strokeDasharray="2,2"
            opacity="0.5"
          />
        )}
      </svg>

      {/* Hover tooltip */}
      {hoveredPosition !== null && (
        <div
          className="absolute z-10 bg-gray-800 text-white text-xs px-2 py-1 rounded shadow-lg border border-gray-600 pointer-events-none"
          style={{
            left: `${hoveredPercentage}%`,
            top: '-30px',
            transform: 'translateX(-50%)',
            whiteSpace: 'nowrap'
          }}
        >
          {formatTime(hoveredPosition)}
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

export default HeatmapTimeline;
