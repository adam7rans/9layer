'use client';

import React, { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
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
  missingTrackCount?: number;
  hasMissingAudio?: boolean;
}

export interface SearchAlbum {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  trackCount: number;
  albumType: string;
  coverUrl?: string;
  missingTrackCount?: number;
  hasMissingAudio?: boolean;
}

export interface SearchTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  artistId: string;
  albumId: string;
  duration: number;
  filePath: string | null;
  fileSize: number | null;
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
                const totalTracks = artist.trackCount ?? 0;
                const missingTracks = artist.missingTrackCount ?? 0;
                const allMissing = totalTracks === 0 || missingTracks >= totalTracks || artist.hasMissingAudio === true;
                const someMissing = !allMissing && missingTracks > 0;

                const baseClasses = 'p-3 border-b last:border-b-0 transition-colors cursor-pointer';
                let containerClasses = `${baseClasses} border-gray-700 ${isSelected ? 'bg-blue-900/40 border-blue-500' : 'hover:bg-gray-700'}`;
                let titleClass = 'font-medium text-sm truncate';
                let metaClass = 'text-xs text-gray-400';
                let badge: ReactNode = null;

                if (allMissing) {
                  containerClasses = `${baseClasses} border-red-800/70 bg-red-950/50 text-red-200/80 ${isSelected ? 'ring-1 ring-red-500/70' : ''}`;
                  titleClass += ' text-red-200';
                  metaClass = 'text-xs text-red-300/80';
                  badge = (
                    <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-red-900/60 border border-red-700/80 text-red-200/90">
                      All songs missing
                    </span>
                  );
                } else if (someMissing) {
                  containerClasses = `${baseClasses} border-amber-700/70 bg-amber-950/40 text-amber-200/90 ${isSelected ? 'ring-1 ring-amber-500/70' : ''}`;
                  titleClass += ' text-amber-100';
                  metaClass = 'text-xs text-amber-200/80';
                  badge = (
                    <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-amber-900/50 border border-amber-700/70 text-amber-100">
                      Some tracks missing
                    </span>
                  );
                }

                return (
                  <div
                    key={artist.id}
                    className={containerClasses}
                    onClick={() => {
                      const nextArtistId = isSelected ? null : artist.id;
                      setSelectedArtistId(nextArtistId);
                      setSelectedAlbumId(null);
                      onArtistClick?.(artist);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className={titleClass}>{artist.name}</div>
                      {badge}
                    </div>
                    <div className={metaClass}>
                      {artist.trackCount} tracks • {artist.albumCount} albums
                      {missingTracks > 0 && (
                        <span className="ml-2">({missingTracks} missing)</span>
                      )}
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
              (selectedArtistId ? results.albums.filter(album => album.artistId === selectedArtistId) : results.albums).map((album) => {
                const isSelected = album.id === selectedAlbumId;
                const totalTracks = album.trackCount ?? 0;
                const missingTracks = album.missingTrackCount ?? 0;
                const allMissing = totalTracks === 0 || missingTracks >= totalTracks || album.hasMissingAudio === true;
                const someMissing = !allMissing && missingTracks > 0;

                const baseClasses = 'p-3 border-b last:border-b-0 transition-colors cursor-pointer';
                let containerClasses = `${baseClasses} border-gray-700 ${isSelected ? 'bg-green-900/40 border-green-500' : 'hover:bg-gray-700'}`;
                let titleClass = 'font-medium text-sm truncate';
                let metaClass = 'text-xs text-gray-400 truncate';
                let typeClass = 'text-xs text-gray-500 truncate';
                let badge: ReactNode = null;

                if (allMissing) {
                  containerClasses = `${baseClasses} border-red-800/70 bg-red-950/50 text-red-200/80 ${isSelected ? 'ring-1 ring-red-500/70' : ''}`;
                  titleClass += ' text-red-200';
                  metaClass = 'text-xs text-red-300/80 truncate';
                  typeClass = 'text-xs text-red-400/70 truncate';
                  badge = (
                    <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-red-900/60 border border-red-700/80 text-red-200/90">
                      All songs missing
                    </span>
                  );
                } else if (someMissing) {
                  containerClasses = `${baseClasses} border-amber-700/70 bg-amber-950/40 text-amber-200/90 ${isSelected ? 'ring-1 ring-amber-500/70' : ''}`;
                  titleClass += ' text-amber-100';
                  metaClass = 'text-xs text-amber-200/80 truncate';
                  typeClass = 'text-xs text-amber-300/70 truncate';
                  badge = (
                    <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-amber-900/50 border border-amber-700/70 text-amber-100">
                      Some tracks missing
                    </span>
                  );
                }

                return (
                  <div
                    key={album.id}
                    className={containerClasses}
                    onClick={() => {
                      const nextAlbumId = isSelected ? null : album.id;
                      setSelectedAlbumId(nextAlbumId);
                      onAlbumClick?.(album);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <div className={titleClass}>{album.title}</div>
                      {badge}
                    </div>
                    <div className={metaClass}>
                      {album.artistName} • {album.trackCount} tracks
                      {missingTracks > 0 && (
                        <span className="ml-2">({missingTracks} missing)</span>
                      )}
                    </div>
                    <div className={typeClass}>{album.albumType}</div>
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
                .map((track) => {
                  const missingAudio = !track.filePath;
                  const containerClasses = missingAudio
                    ? 'p-3 border-b border-red-800/70 last:border-b-0 bg-red-950/60 text-red-200/80'
                    : 'p-3 border-b border-gray-700 last:border-b-0 hover:bg-gray-700 transition-colors';
                  const secondaryTextClass = missingAudio ? 'text-red-300/80' : 'text-gray-400';
                  const tertiaryTextClass = missingAudio ? 'text-red-400/70' : 'text-gray-500';
                  const durationTextClass = missingAudio ? 'text-red-300/70' : 'text-gray-400';

                  return (
                    <div key={track.id} className={containerClasses}>
                      <div className="flex items-center gap-2">
                        {/* Play Button */}
                        <Button
                          onClick={() => onPlayTrack(track.id)}
                          className="h-8 w-8 p-0 flex-shrink-0"
                          variant={currentTrackId === track.id && isPlaying ? 'default' : 'ghost'}
                          disabled={missingAudio}
                          title={missingAudio ? 'Audio file missing' : undefined}
                        >
                          {currentTrackId === track.id && isPlaying ? (
                            <PauseIcon className="w-4 h-4" />
                          ) : (
                            <PlayIcon className="w-4 h-4" />
                          )}
                        </Button>

                        {/* Track Info */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <div className={`font-medium truncate text-sm ${missingAudio ? 'text-red-200' : ''}`}>
                              {track.title}
                            </div>
                            {missingAudio && (
                              <span className="text-[10px] uppercase tracking-wide font-semibold px-2 py-0.5 rounded-full bg-red-900/70 border border-red-700 text-red-200/90">
                                Audio missing
                              </span>
                            )}
                          </div>
                          <div className={`text-xs truncate ${secondaryTextClass}`}>{track.artist}</div>
                          <div className={`text-xs truncate ${tertiaryTextClass}`}>{track.album}</div>
                        </div>

                        {/* Rating Display */}
                        <div className={`flex items-center gap-1 text-xs ${missingAudio ? 'text-red-300/70' : 'text-gray-400'}`}>
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
                        <div className={`text-xs font-mono flex-shrink-0 w-12 text-right ${durationTextClass}`}>
                          {track.duration ? formatTime(track.duration) : '--:--'}
                        </div>
                      </div>
                    </div>
                  );
                })
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