'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { API_BASE } from '@/lib/api';
import {
  PlayIcon,
  PauseIcon,
  PlusIcon,
  MinusIcon,
  UserIcon,
  MusicalNoteIcon,
  QueueListIcon
} from '@heroicons/react/24/solid';

export interface SearchArtist {
  id: string;
  name: string;
  trackCount: number;
  albumCount: number;
}

export interface SearchAlbum {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  trackCount: number;
  albumType: string;
  coverUrl?: string;
}

export interface SearchTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  artistId: string;
  albumId: string;
  duration: number;
  filePath: string;
  fileSize: number;
  youtubeId?: string;
  likeability: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SearchResults {
  artists: SearchArtist[];
  albums: SearchAlbum[];
  tracks: SearchTrack[];
  totalArtists: number;
  totalAlbums: number;
  totalTracks: number;
}

interface SearchResultsProps {
  query: string;
  onPlayTrack: (trackId: string) => void;
  onIncrementRating: (trackId: string) => void;
  onDecrementRating: (trackId: string) => void;
  getTrackRating: (trackId: string) => number;
  currentTrackId?: string;
  isPlaying: boolean;
  onArtistClick?: (artist: SearchArtist) => void;
  onAlbumClick?: (album: SearchAlbum) => void;
}

const SearchResults = ({
  query,
  onPlayTrack,
  onIncrementRating,
  onDecrementRating,
  getTrackRating,
  currentTrackId,
  isPlaying,
  onArtistClick,
  onAlbumClick
}: SearchResultsProps) => {
  const [results, setResults] = useState<SearchResults | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const requestIdRef = useRef(0);
  const [selectedArtistId, setSelectedArtistId] = useState<string | null>(null);
  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);

  // Format time helper
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Debounced search function
  const fetchResults = useCallback(async (searchQuery: string) => {
    const trimmedQuery = searchQuery.trim();
    const params = new URLSearchParams();
    if (trimmedQuery) {
      params.set('q', trimmedQuery);
    }
    const useFullLibraryLimits = !trimmedQuery;
    params.set('artistLimit', (useFullLibraryLimits ? 500 : 100).toString());
    params.set('albumLimit', (useFullLibraryLimits ? 2000 : 200).toString());
    params.set('trackLimit', (useFullLibraryLimits ? 5000 : 500).toString());
    const url = `${API_BASE}/search/all?${params.toString()}`;
    const currentRequestId = ++requestIdRef.current;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }

      if (requestIdRef.current === currentRequestId) {
        setResults(data.results);
        if (!trimmedQuery) {
          setSelectedArtistId(null);
          setSelectedAlbumId(null);
        }
      }
    } catch (err) {
      console.error('Search error:', err);
      if (requestIdRef.current === currentRequestId) {
        setError(err instanceof Error ? err.message : 'Search failed');
        setResults(null);
      }
    } finally {
      if (requestIdRef.current === currentRequestId) {
        setIsLoading(false);
      }
    }
  }, []);

  // Effect to handle debounced search
  useEffect(() => {
    // Clear previous timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout for debounced search
    debounceTimeoutRef.current = setTimeout(() => {
      const trimmedQuery = query.trim();
      if (!trimmedQuery) {
        fetchResults('');
        return;
      }
      fetchResults(trimmedQuery);
    }, 300); // 300ms debounce

    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, [query, fetchResults]);

  // Show loading state
  if (isLoading) {
    return (
      <div className="p-4 text-center">
        <div className="text-gray-400">Searching...</div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="p-4 text-center">
        <div className="text-red-400">{error}</div>
      </div>
    );
  }

  // Show no results
  if (results && results.artists.length === 0 && results.albums.length === 0 && results.tracks.length === 0 && query.trim()) {
    return (
      <div className="p-4 text-center">
        <div className="text-gray-400">No results found for "{query}"</div>
      </div>
    );
  }

  if (!results) {
    return null;
  }

  return (
    <div className="flex-1 overflow-auto">
      {/* Responsive equal-width columns */}
      <div className="h-full grid grid-cols-1 md:grid-cols-3 gap-2 p-2">

        {/* Artists Column */}
        <div className="bg-gray-800 rounded-lg flex flex-col min-h-0">
          <div className="p-3 border-b border-gray-700 flex items-center gap-2">
            <UserIcon className="w-4 h-4 text-blue-400" />
            <h3 className="font-medium text-blue-400">Artists ({results.totalArtists})</h3>
          </div>
          <div className="flex-1 overflow-auto min-h-0 scrollbar-thin-custom">
            {results.artists.length > 0 ? (
              results.artists.map((artist) => {
                const isSelected = artist.id === selectedArtistId;
                return (
                  <div
                    key={artist.id}
                    className={
                      `p-3 border-b border-gray-700 last:border-b-0 transition-colors cursor-pointer ` +
                      (isSelected ? 'bg-blue-900/40 border-blue-500' : 'hover:bg-gray-700')
                    }
                    onClick={() => {
                      const nextArtistId = isSelected ? null : artist.id;
                      setSelectedArtistId(nextArtistId);
                      setSelectedAlbumId(null);
                      onArtistClick?.(artist);
                    }}
                  >
                    <div className="font-medium text-sm">{artist.name}</div>
                    <div className="text-xs text-gray-400">
                      {artist.trackCount} tracks • {artist.albumCount} albums
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-3 text-xs text-gray-400">No artists found</div>
            )}
          </div>
        </div>

        {/* Albums Column */}
        <div className="bg-gray-800 rounded-lg flex flex-col min-h-0">
          <div className="p-3 border-b border-gray-700 flex items-center gap-2">
            <QueueListIcon className="w-4 h-4 text-green-400" />
            <h3 className="font-medium text-green-400">Albums ({results.totalAlbums})</h3>
          </div>
          <div className="flex-1 overflow-auto min-h-0 scrollbar-thin-custom">
            {results.albums.length > 0 ? (
              (selectedArtistId
                ? results.albums.filter(album => album.artistId === selectedArtistId)
                : results.albums
              ).map((album) => {
                const isSelected = album.id === selectedAlbumId;
                return (
                  <div
                    key={album.id}
                    className={
                      `p-3 border-b border-gray-700 last:border-b-0 transition-colors cursor-pointer ` +
                      (isSelected ? 'bg-green-900/40 border-green-500' : 'hover:bg-gray-700')
                    }
                    onClick={() => {
                      const nextAlbumId = isSelected ? null : album.id;
                      setSelectedAlbumId(nextAlbumId);
                      onAlbumClick?.(album);
                    }}
                  >
                    <div className="font-medium text-sm truncate">{album.title}</div>
                    <div className="text-xs text-gray-400 truncate">
                      {album.artistName} • {album.trackCount} tracks
                    </div>
                    <div className="text-xs text-gray-500 truncate">
                      {album.albumType}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-3 text-xs text-gray-400">No albums found</div>
            )}
          </div>
        </div>

        {/* Tracks Column */}
        <div className="bg-gray-800 rounded-lg flex flex-col min-h-0">
          <div className="p-3 border-b border-gray-700 flex items-center gap-2">
            <MusicalNoteIcon className="w-4 h-4 text-purple-400" />
            <h3 className="font-medium text-purple-400">Songs ({results.totalTracks})</h3>
          </div>
          <div className="flex-1 overflow-auto min-h-0 scrollbar-thin-custom">
            {results.tracks.length > 0 ? (
              results.tracks
                .filter(track => (selectedArtistId ? track.artistId === selectedArtistId : true))
                .filter(track => (selectedAlbumId ? track.albumId === selectedAlbumId : true))
                .map((track) => (
                  <div key={track.id} className="p-3 border-b border-gray-700 last:border-b-0 hover:bg-gray-700 transition-colors">
                    <div className="flex items-center gap-2">
                      {/* Play Button */}
                      <Button
                        onClick={() => onPlayTrack(track.id)}
                        className="h-8 w-8 p-0 flex-shrink-0"
                        variant={currentTrackId === track.id && isPlaying ? "default" : "ghost"}
                      >
                        {currentTrackId === track.id && isPlaying ? (
                          <PauseIcon className="w-4 h-4" />
                        ) : (
                          <PlayIcon className="w-4 h-4" />
                        )}
                      </Button>

                      {/* Track Info */}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate text-sm">{track.title}</div>
                        <div className="text-xs text-gray-400 truncate">{track.artist}</div>
                        <div className="text-xs text-gray-500 truncate">{track.album}</div>
                      </div>

                      {/* Rating Display */}
                      <div className="flex items-center gap-1 text-xs text-gray-400">
                        <span>{getTrackRating(track.id)}</span>
                      </div>

                      {/* Rating Buttons */}
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <Button
                          onClick={() => onDecrementRating(track.id)}
                          className="h-6 w-6 p-0"
                          variant="ghost"
                          size="sm"
                        >
                          <MinusIcon className="w-3 h-3" />
                        </Button>
                        <Button
                          onClick={() => onIncrementRating(track.id)}
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
                  </div>
                ))
            ) : (
              <div className="p-3 text-xs text-gray-400">No songs found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
;

export default SearchResults;