'use client';

import { useEffect, useState } from 'react';
import { TrackInfo } from '@/types/websocket';

interface AlbumArtProps {
  track: TrackInfo | null;
  className?: string;
}

const AlbumArt = ({ track, className = '' }: AlbumArtProps) => {
  const [isLoading, setIsLoading] = useState(true);
  const [currentArtwork, setCurrentArtwork] = useState<string | null>(null);
  const [nextArtwork, setNextArtwork] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Handle artwork transitions when track changes
  useEffect(() => {
    if (!track) {
      setCurrentArtwork(null);
      setIsLoading(false);
      return;
    }

    const artworkUrl = track.artworkUrl || null;
    
    if (artworkUrl !== currentArtwork) {
      if (currentArtwork) {
        // Start transition to new artwork
        setNextArtwork(artworkUrl);
        setIsTransitioning(true);
        
        // Wait for fade out to complete before changing the image
        const timer = setTimeout(() => {
          setCurrentArtwork(artworkUrl);
          setNextArtwork(null);
          setIsTransitioning(false);
        }, 200); // Match this with the CSS transition duration
        
        return () => clearTimeout(timer);
      } else {
        // First load, no transition needed
        setCurrentArtwork(artworkUrl);
        setIsLoading(false);
      }
    }
  }, [track, currentArtwork]);

  // Fallback to a music note icon when no artwork is available
  if (!currentArtwork) {
    return (
      <div 
        className={`${className} flex items-center justify-center bg-gradient-to-br from-gray-200 to-gray-300 text-gray-400 rounded-lg shadow-md`}
        aria-label="No album artwork available"
      >
        <svg 
          className="w-1/2 h-1/2" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24" 
          xmlns="http://www.w3.org/2000/svg"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={1.5} 
            d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" 
          />
        </svg>
      </div>
    );
  }

  return (
    <div className={`${className} relative overflow-hidden rounded-lg shadow-md`}>
      {/* Current artwork */}
      <img
        src={currentArtwork}
        alt={`Album artwork for ${track?.title || 'current track'}`}
        className={`w-full h-full object-cover transition-opacity duration-200 ${
          isTransitioning ? 'opacity-0' : 'opacity-100'
        }`}
        onLoad={() => setIsLoading(false)}
        onError={() => {
          console.error('Failed to load album artwork');
          setCurrentArtwork(null);
        }}
      />
      
      {/* Loading spinner */}
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-20">
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
        </div>
      )}
      
      {/* Next artwork (for transitions) */}
      {nextArtwork && (
        <img
          src={nextArtwork}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onLoad={() => {
            // Start fading in the new artwork
            setIsLoading(false);
          }}
        />
      )}
    </div>
  );
};

export default AlbumArt;