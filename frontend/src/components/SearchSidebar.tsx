'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TrackInfo } from '@/types/websocket';
import { Search, X, Music, User, Album } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SearchSidebarProps {
  onTrackSelect: (track: TrackInfo) => void;
  isOpen: boolean;
  onClose: () => void;
  disabled?: boolean;
}

interface SearchResults {
  tracks: TrackInfo[];
  artists: { id: string; name: string; trackCount: number }[];
  albums: { id: string; title: string; artist: string; trackCount: number }[];
}

export default function SearchSidebar({ 
  onTrackSelect, 
  isOpen, 
  onClose, 
  disabled = false 
}: SearchSidebarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>({ tracks: [], artists: [], albums: [] });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'tracks' | 'artists' | 'albums'>('tracks');
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Focus input when sidebar opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Search function
  const searchContent = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults({ tracks: [], artists: [], albums: [] });
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `http://localhost:8000/api/tracks?search=${encodeURIComponent(searchQuery)}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      
      if (!Array.isArray(data)) {
        throw new Error('Invalid response format');
      }

      // Transform and organize data
      const tracks: TrackInfo[] = data.map((track: any) => ({
        id: track.id || '',
        title: track.title || 'Unknown Title',
        artist: track.artist || 'Unknown Artist',
        album: track.album?.title || 'Unknown Album',
        artworkUrl: track.artwork_url || track.artworkUrl || null,
      }));

      // Group by artists and albums for organized display
      const artistMap = new Map();
      const albumMap = new Map();

      tracks.forEach(track => {
        // Artists
        if (!artistMap.has(track.artist)) {
          artistMap.set(track.artist, { id: track.artist, name: track.artist, trackCount: 0 });
        }
        artistMap.get(track.artist).trackCount++;

        // Albums
        const albumKey = `${track.album}-${track.artist}`;
        if (!albumMap.has(albumKey)) {
          albumMap.set(albumKey, { 
            id: albumKey, 
            title: track.album, 
            artist: track.artist, 
            trackCount: 0 
          });
        }
        albumMap.get(albumKey).trackCount++;
      });

      setResults({
        tracks,
        artists: Array.from(artistMap.values()),
        albums: Array.from(albumMap.values()),
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Search failed';
      setError(errorMessage);
      setResults({ tracks: [], artists: [], albums: [] });
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    debounceTimeout.current = setTimeout(() => {
      searchContent(value);
    }, 300);
  };

  const handleTrackSelect = (track: TrackInfo) => {
    onTrackSelect(track);
    // Don't close sidebar, allow multiple selections
  };

  const getTabCount = (tab: keyof SearchResults) => {
    return results[tab].length;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 left-0 w-full md:w-1/2 bg-white border-r border-gray-200 z-40 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <h2 className="text-lg font-semibold">Search Music</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Search Input */}
      <div className="p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-500" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={handleInputChange}
            placeholder="Search for tracks, artists, albums..."
            className="w-full pl-10 pr-4 py-2 bg-white border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={disabled}
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        {(['tracks', 'artists', 'albums'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              "flex-1 px-4 py-2 text-sm font-medium capitalize transition-colors",
              "hover:text-gray-900",
              activeTab === tab
                ? "text-gray-900 border-b-2 border-blue-600"
                : "text-gray-500"
            )}
          >
            {tab} ({getTabCount(tab)})
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="text-gray-500">Searching...</div>
          </div>
        ) : error ? (
          <div className="text-red-600 text-center py-8">{error}</div>
        ) : (
          <div className="space-y-2">
            {activeTab === 'tracks' && (
              <>
                {results.tracks.length === 0 && query ? (
                  <div className="text-gray-500 text-center py-8">
                    No tracks found for "{query}"
                  </div>
                ) : (
                  results.tracks.map((track) => (
                    <Card 
                      key={track.id} 
                      className="cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => handleTrackSelect(track)}
                    >
                      <CardContent className="p-3 flex items-center space-x-3">
                        <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-md overflow-hidden">
                          {track.artworkUrl ? (
                            <img 
                              src={track.artworkUrl} 
                              alt={track.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Music className="h-6 w-6 text-gray-500" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{track.title}</p>
                          <p className="text-sm text-gray-500 truncate">{track.artist}</p>
                          <p className="text-xs text-gray-400 truncate">{track.album}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </>
            )}

            {activeTab === 'artists' && (
              <>
                {results.artists.length === 0 && query ? (
                  <div className="text-gray-500 text-center py-8">
                    No artists found for "{query}"
                  </div>
                ) : (
                  results.artists.map((artist) => (
                    <Card key={artist.id} className="cursor-pointer hover:bg-gray-50 transition-colors">
                      <CardContent className="p-3 flex items-center space-x-3">
                        <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center">
                          <User className="h-6 w-6 text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{artist.name}</p>
                          <p className="text-sm text-gray-500">
                            {artist.trackCount} track{artist.trackCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </>
            )}

            {activeTab === 'albums' && (
              <>
                {results.albums.length === 0 && query ? (
                  <div className="text-gray-500 text-center py-8">
                    No albums found for "{query}"
                  </div>
                ) : (
                  results.albums.map((album) => (
                    <Card key={album.id} className="cursor-pointer hover:bg-gray-50 transition-colors">
                      <CardContent className="p-3 flex items-center space-x-3">
                        <div className="flex-shrink-0 w-12 h-12 bg-gray-100 rounded-md flex items-center justify-center">
                          <Album className="h-6 w-6 text-gray-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{album.title}</p>
                          <p className="text-sm text-gray-500 truncate">{album.artist}</p>
                          <p className="text-xs text-gray-400">
                            {album.trackCount} track{album.trackCount !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}