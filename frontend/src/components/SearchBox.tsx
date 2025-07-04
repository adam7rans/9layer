'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { TrackInfo } from '@/types/websocket';

interface SearchBoxProps {
  onTrackSelect: (track: TrackInfo) => void;
  disabled?: boolean;
}

const SearchBox = ({ onTrackSelect, disabled = false }: SearchBoxProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TrackInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resultsRef = useRef<HTMLUListElement | null>(null);
  const debounceTimeout = useRef<NodeJS.Timeout | null>(null);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: globalThis.KeyboardEvent) => {
      if (!isFocused || results.length === 0) return;

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setActiveIndex(prev => Math.min(prev + 1, results.length - 1));
          scrollToActiveItem();
          break;
        case 'ArrowUp':
          e.preventDefault();
          setActiveIndex(prev => Math.max(prev - 1, -1));
          scrollToActiveItem();
          break;
        case 'Enter':
          e.preventDefault();
          if (activeIndex >= 0 && activeIndex < results.length) {
            handleTrackSelect(results[activeIndex]);
          }
          break;
        case 'Escape':
          e.preventDefault();
          setIsFocused(false);
          setActiveIndex(-1);
          break;
      }
    };

    const scrollToActiveItem = () => {
      if (resultsRef.current && activeIndex >= 0) {
        const activeElement = resultsRef.current.children[activeIndex] as HTMLElement;
        if (activeElement) {
          activeElement.scrollIntoView({
            block: 'nearest',
            behavior: 'smooth'
          });
        }
      }
    };

    if (isFocused) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isFocused, results, activeIndex]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsFocused(false);
        setActiveIndex(-1);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Debounce search
  const searchTracks = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    setIsLoading(true);
    setError(null);
    
    console.log('Initiating search for:', searchQuery);

    try {
      const url = `http://localhost:8000/api/tracks?search=${encodeURIComponent(searchQuery)}`;
      console.log('Making request to:', url);
      
      const startTime = performance.now();
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      });
      
      const responseTime = performance.now() - startTime;
      console.log(`Response received in ${responseTime.toFixed(2)}ms`);
      
      if (!response.ok) {
        let errorText;
        try {
          errorText = await response.text();
          console.error('Search API error response:', {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            body: errorText,
          });
        } catch (e) {
          console.error('Failed to parse error response:', e);
          errorText = 'Failed to parse error response';
        }
        
        throw new Error(`Search failed (${response.status}): ${response.statusText}. ${errorText}`);
      }
      
      let data;
      try {
        data = await response.json();
        console.log('Search results:', data);
      } catch (e) {
        console.error('Failed to parse JSON response:', e);
        throw new Error('Invalid JSON response from server');
      }
      
      if (!Array.isArray(data)) {
        console.error('Unexpected response format:', data);
        throw new Error('Invalid response format: expected an array');
      }
      
      // Transform the data to match TrackInfo
      const tracks: TrackInfo[] = data.map((track: any) => {
        const mappedTrack = {
          id: track.id || '',
          title: track.title || 'Unknown Title',
          artist: track.artist || 'Unknown Artist',
          album: track.album || 'Unknown Album',
          duration: track.duration || 0,
          artworkUrl: track.artwork_url || track.artworkUrl || null,
        };
        
        console.log('Mapped track:', mappedTrack);
        return mappedTrack;
      });
      
      setResults(tracks);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'An unknown error occurred';
      console.error('Search error:', {
        error: err,
        message: errorMessage,
        timestamp: new Date().toISOString(),
      });
      setError(errorMessage);
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle input change with debounce
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setQuery(value);

    // Clear previous timeout
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    // Set new timeout
    debounceTimeout.current = setTimeout(() => {
      searchTracks(value);
    }, 300); // 300ms debounce
  };

  const handleTrackSelect = (track: TrackInfo) => {
    onTrackSelect(track);
    setQuery('');
    setResults([]);
    setActiveIndex(-1);
    setIsFocused(false);
    if (inputRef.current) {
      inputRef.current.blur();
    }
  };

  return (
    <div className="relative w-full max-w-md mx-auto" ref={searchRef}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            setIsFocused(true);
            setActiveIndex(-1);
          }}
          onKeyDown={(e) => {
            // Prevent form submission on enter
            if (e.key === 'Enter') {
              e.preventDefault();
            }
          }}
          placeholder="Search for tracks..."
          className={`w-full p-2 pl-10 pr-4 rounded-lg border ${
            disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'
          } focus:outline-none focus:ring-2 focus:ring-blue-500`}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isFocused && results.length > 0}
          aria-autocomplete="list"
          aria-controls="search-results"
          aria-activedescendant={activeIndex >= 0 ? `search-result-${activeIndex}` : undefined}
        />
        <div className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400">
          {isLoading ? (
            <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          ) : (
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
        </div>
      </div>

      {/* Dropdown with results */}
      {isFocused && (query || results.length > 0 || isLoading) && (
        <div className="absolute z-10 w-full mt-1 bg-white rounded-md shadow-lg">
          {isLoading ? (
            <div className="px-4 py-2 text-sm text-gray-500">Searching...</div>
          ) : error ? (
            <div className="px-4 py-2 text-sm text-red-500">{error}</div>
          ) : results.length > 0 ? (
            <ul 
            ref={resultsRef}
            className="py-1 max-h-60 overflow-auto"
            role="listbox"
            aria-label="Search results"
          >
              {results.map((track, index) => (
                <li
                  key={track.id}
                  className={`px-4 py-2 cursor-pointer flex items-center ${
                    index === activeIndex 
                      ? 'bg-blue-100' 
                      : 'hover:bg-gray-100'
                  }`}
                  onClick={() => handleTrackSelect(track)}
                  onMouseEnter={() => setActiveIndex(index)}
                  role="option"
                  aria-selected={index === activeIndex}
                >
                  <div className="flex-shrink-0 h-10 w-10 bg-gray-200 rounded-md overflow-hidden mr-3">
                    {track.artworkUrl ? (
                      <img src={track.artworkUrl} alt={track.title} className="h-full w-full object-cover" />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center bg-gray-300 text-gray-500">
                        <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{track.title}</p>
                    <p className="text-sm text-gray-500 truncate">{track.artist}</p>
                  </div>
                </li>
              ))}
            </ul>
          ) : query ? (
            <div className="px-4 py-2 text-sm text-gray-500">No results found for "{query}"</div>
          ) : null}
        </div>
      )}
    </div>
  );
};

export default SearchBox;