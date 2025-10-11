'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { api, Track, PlaybackState, API_BASE } from '@/lib/api';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useProgressSmoothing } from '@/hooks/useProgressSmoothing';
import AnalyticsDashboard from './AnalyticsDashboard';
import SearchResults, { SearchArtist, SearchAlbum } from './SearchResults';
import HeatmapTimeline from './HeatmapTimeline';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
  PlayIcon,
  PauseIcon,
  BackwardIcon,
  ForwardIcon,
  SpeakerWaveIcon,
  MagnifyingGlassIcon,
  ArrowDownTrayIcon,
  ListBulletIcon,
  PlusIcon,
  MinusIcon,
  ChartBarIcon
} from '@heroicons/react/24/solid';
import { cn } from '@/lib/utils';

interface IntegratedPlayerProps {
  className?: string;
}

const IntegratedPlayer = ({ className }: IntegratedPlayerProps) => {
  const [playbackState, setPlaybackState] = useState<PlaybackState>({
    isPlaying: false,
    position: 0,
    volume: 0.8, // Start at 80% volume (0.8 on 0-1 scale) 
    queue: []
  });
  const [tracks, setTracks] = useState<Track[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentView, setCurrentView] = useState<'library' | 'queue' | 'download' | 'analytics'>('library');
  const [downloadUrl, setDownloadUrl] = useState('');
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadJobs, setDownloadJobs] = useState<Array<{
    jobId: string;
    title?: string;
    artist?: string;
    album?: string;
    youtubeId?: string;
    status?: 'pending' | 'downloading' | 'processing' | 'completed' | 'failed';
    progress?: number;
    errorMessage?: string;
    errorCode?: string;
    stallDetected?: boolean;
    stallSecondsRemaining?: number;
    retrying?: boolean;
    playlistId?: string;
  }>>([]);
  const [completedAlbums, setCompletedAlbums] = useState<Array<{
    albumName: string;
    totalTracks: number;
    completedAt: Date;
    trackIds: string[]; // Specific track IDs for this album
  }>>([]);
  const [playlistSummaries, setPlaylistSummaries] = useState<Array<{
    albumName: string;
    totalTracks: number;
    completedTracks: number;
    failed: Array<{ title?: string; youtubeId?: string; reason?: string }>;
    receivedAt: Date;
  }>>([]);
  const [playbackMode, setPlaybackMode] = useState<'random' | 'sequential'>('random');
  const [error, setError] = useState<string | null>(null);
  const [hasUserInteracted, setHasUserInteracted] = useState(false);
  const [showAutoplayHelp, setShowAutoplayHelp] = useState(false);
  const [localPlayback, setLocalPlayback] = useState(true);
  const [analyticsRefreshTrigger, setAnalyticsRefreshTrigger] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  const initRef = useRef(false);
  const isUserAdjustingVolume = useRef(false);
  
  // Analytics hook
  const analytics = useAnalytics();

  // Progress smoothing hook for better UX during downloads
  const smoothedDownloadJobs = useProgressSmoothing(downloadJobs);

  const handleStopAndRetry = useCallback(async (jobId: string) => {
    try {
      setDownloadJobs(prev => prev.map(job => job.jobId === jobId ? { ...job, retrying: true } : job));
      const result = await api.retryDownloadJob(jobId);
      const newJobId = result.data?.jobId;
      const retryError = result.error;

      if (result.success && typeof newJobId === 'string' && newJobId.length > 0) {
        setDownloadJobs(prev => {
          const remaining = prev.filter(job => job.jobId !== jobId);
          const oldJob = prev.find(job => job.jobId === jobId);
          const cloned = oldJob ? {
            ...oldJob,
            jobId: newJobId,
            status: 'pending' as const,
            progress: 0,
            errorMessage: undefined,
            errorCode: undefined,
            stallDetected: false,
            stallSecondsRemaining: undefined,
            retrying: false,
          } : undefined;
          return cloned ? [cloned, ...remaining] : remaining;
        });
      } else if (result.success && !newJobId) {
        // Backend acknowledged but did not create new job. surface message.
        setDownloadJobs(prev => prev.map(job => job.jobId === jobId ? { ...job, retrying: false, errorMessage: 'Retry acknowledged but no new job started.' } : job));
      } else {
        // Parse and improve error message
        let errorMsg = retryError || 'Retry failed';
        if (retryError?.includes('not found')) {
          errorMsg = 'Job expired or not found. Download may be too old to retry.';
        } else if (retryError?.includes('400')) {
          errorMsg = 'Cannot retry this job. It may have already completed or been removed.';
        }
        setDownloadJobs(prev => prev.map(job => job.jobId === jobId ? { ...job, retrying: false, errorMessage: errorMsg } : job));
      }
    } catch (error) {
      console.error('Retry download failed:', error);
      const errorMsg = error instanceof Error && error.message.includes('not found')
        ? 'Job expired. Try downloading again from the URL.'
        : 'Retry failed. Check your connection and try again.';
      setDownloadJobs(prev => prev.map(job => job.jobId === jobId ? { ...job, retrying: false, errorMessage: errorMsg } : job));
    }
  }, []);

  const handleManualRetry = useCallback(async (jobId: string) => {
    const job = downloadJobs.find(j => j.jobId === jobId);
    await handleStopAndRetry(jobId);
    if (job?.errorMessage) {
      setError(job.errorMessage);
    }
  }, [downloadJobs, handleStopAndRetry]);

  const handleCancel = useCallback(async (jobId: string) => {
    try {
      setDownloadJobs(prev => prev.map(job => job.jobId === jobId ? { ...job, retrying: false, status: 'failed', errorMessage: 'Download cancelled by user.' } : job));
      const result = await api.cancelDownloadJob(jobId);
      if (!result.success) {
        setError(result.error || 'Failed to cancel download');
      }
    } catch (error) {
      console.error('Cancel download failed:', error);
      setError('Failed to cancel download');
    }
  }, [setDownloadJobs]);

  // Play Album function - starts playing first track of album in sequential mode
  const handlePlayAlbum = useCallback(async (album: { albumName: string; trackIds: string[] }) => {
    try {
      console.log('[FRONTEND] Playing album:', album.albumName);
      console.log('[FRONTEND] Track IDs to find:', album.trackIds);

      // Switch to sequential mode
      setPlaybackMode('sequential');

      // Get ALL tracks first
      const response = await api.getTracks();
      if (response.success && response.data) {
        console.log('[FRONTEND] Total tracks in database:', response.data.tracks.length);

        // Filter to only the specific tracks from this album completion
        const albumTracks = response.data.tracks.filter(track =>
          album.trackIds.includes(track.id)
        );

        console.log('[FRONTEND] Matching tracks found:', albumTracks.length);
        console.log('[FRONTEND] Matching tracks:', albumTracks.map(t => ({id: t.id, title: t.title})));

        if (albumTracks.length > 0) {
          // Sort tracks by title for consistent order
          const sortedTracks = albumTracks.sort((a, b) => a.title.localeCompare(b.title));

          // Set queue to album tracks and play first one
          setPlaybackState(prev => ({
            ...prev,
            queue: sortedTracks,
            currentTrack: sortedTracks[0]
          }));

          // Start playing the first track
          setError(null);
          const playResponse = await api.playTrack(sortedTracks[0].id);
          if (playResponse.success) {
            setPlaybackState(prev => ({
              ...prev,
              isPlaying: true
            }));
            if (sortedTracks[0].id) {
              await analytics.startListeningSession(sortedTracks[0].id);
              setAnalyticsRefreshTrigger(prev => prev + 1);
            }
          } else {
            setError(playResponse.error || 'Failed to play album');
          }
        } else {
          setError('No tracks found for this album');
        }
      }
    } catch (error) {
      console.error('Failed to play album:', error);
      setError('Failed to play album');
    }
  }, [analytics]);

  // Sequential next track function
  const getNextTrackSequential = useCallback((currentTrack: Track, queue: Track[]) => {
    if (!currentTrack || queue.length === 0) return null;

    const currentIndex = queue.findIndex(track => track.id === currentTrack.id);
    if (currentIndex === -1 || currentIndex === queue.length - 1) {
      return queue[0]; // Loop back to start
    }

    return queue[currentIndex + 1];
  }, []);

  // Modified getRandomTrack to respect playback mode
  const getNextTrack = useCallback(async () => {
    if (playbackMode === 'sequential' && playbackState.queue.length > 0 && playbackState.currentTrack) {
      return getNextTrackSequential(playbackState.currentTrack, playbackState.queue);
    }

    // Fall back to random
    const response = await api.getRandomTrack();
    return response.success && response.data?.track ? response.data.track : null;
  }, [playbackMode, playbackState.queue, playbackState.currentTrack, getNextTrackSequential]);

  // Handler for artist clicks - get artist tracks and play first one
  const handleArtistClick = useCallback(async (artist: SearchArtist) => {
    try {
      const response = await fetch(`${API_BASE}/search/artist/${artist.id}/tracks?limit=50`);
      const data = await response.json();

      if (data.success && data.tracks && data.tracks.length > 0) {
        // Convert search tracks to Track format and set as queue
        const artistTracks: Track[] = data.tracks.map((track: any) => ({
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          artistId: track.artistId,
          albumId: track.albumId,
          duration: track.duration,
          filePath: track.filePath,
          fileSize: track.fileSize,
          youtubeId: track.youtubeId,
          likeability: track.likeability,
          createdAt: new Date(track.createdAt),
          updatedAt: new Date(track.updatedAt)
        }));

        // Switch to sequential mode for artist playback
        setPlaybackMode('sequential');

        // Set queue and play first track
        setPlaybackState(prev => ({
          ...prev,
          queue: artistTracks,
          currentTrack: artistTracks[0]
        }));

        // Start playing the first track
        const playResponse = await api.playTrack(artistTracks[0].id);
        if (playResponse.success) {
          setPlaybackState(prev => ({
            ...prev,
            isPlaying: true
          }));
          if (artistTracks[0].id) {
            await analytics.startListeningSession(artistTracks[0].id);
            setAnalyticsRefreshTrigger(prev => prev + 1);
          }
        } else {
          setError(playResponse.error || 'Failed to play artist tracks');
        }
      }
    } catch (error) {
      console.error('Failed to load artist tracks:', error);
      setError('Failed to load artist tracks');
    }
  }, [analytics]);

  // Handler for album clicks - get album tracks and play first one
  const handleAlbumClick = useCallback(async (album: SearchAlbum) => {
    try {
      const response = await fetch(`${API_BASE}/search/album/${album.id}/tracks`);
      const data = await response.json();

      if (data.success && data.tracks && data.tracks.length > 0) {
        // Convert search tracks to Track format and set as queue
        const albumTracks: Track[] = data.tracks.map((track: any) => ({
          id: track.id,
          title: track.title,
          artist: track.artist,
          album: track.album,
          artistId: track.artistId,
          albumId: track.albumId,
          duration: track.duration,
          filePath: track.filePath,
          fileSize: track.fileSize,
          youtubeId: track.youtubeId,
          likeability: track.likeability,
          createdAt: new Date(track.createdAt),
          updatedAt: new Date(track.updatedAt)
        }));

        // Switch to sequential mode for album playback
        setPlaybackMode('sequential');

        // Set queue and play first track
        setPlaybackState(prev => ({
          ...prev,
          queue: albumTracks,
          currentTrack: albumTracks[0]
        }));

        // Start playing the first track
        const playResponse = await api.playTrack(albumTracks[0].id);
        if (playResponse.success) {
          setPlaybackState(prev => ({
            ...prev,
            isPlaying: true
          }));
          if (albumTracks[0].id) {
            await analytics.startListeningSession(albumTracks[0].id);
            setAnalyticsRefreshTrigger(prev => prev + 1);
          }
        } else {
          setError(playResponse.error || 'Failed to play album tracks');
        }
      }
    } catch (error) {
      console.error('Failed to load album tracks:', error);
      setError('Failed to load album tracks');
    }
  }, [analytics]);

  // Load and play a random track on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const playRandom = async () => {
      try {
        const res = await api.getRandomTrack();
        if (res.success && res.data?.track) {
          const t = res.data.track;
          // Keep tracks list minimal: only the current one
          setTracks([t]);
          // Start playback directly to avoid dependency on handlePlay declaration order
          setError(null);
          const response = await api.playTrack(t.id);
          if (response.success) {
            setPlaybackState(prev => ({
              ...prev,
              isPlaying: true,
              currentTrack: t
            }));
            if (t.id) {
              await analytics.startListeningSession(t.id);
              setAnalyticsRefreshTrigger(prev => prev + 1);
            }
          } else {
            setError(response.error || 'Failed to play track');
          }
        } else if (!res.success) {
          setError(res.error || 'Failed to load random track');
        }
      } catch (e) {
        console.error('Failed to load random track:', e);
        setError('Failed to load random track');
      }
    };

    playRandom();
  }, [analytics]);

  // Set up user interaction listeners
  useEffect(() => {
    const handleUserInteraction = () => {
      setHasUserInteracted(true);
      setShowAutoplayHelp(false);
    };

    const events = ['click', 'keydown', 'touchstart'];
    events.forEach(event => {
      document.addEventListener(event, handleUserInteraction, { once: true });
    });

    return () => {
      events.forEach(event => {
        document.removeEventListener(event, handleUserInteraction);
      });
    };
  }, []);

  

  // Get current track index for navigation
  const getCurrentTrackIndex = useCallback(() => {
    if (!playbackState.currentTrack) return -1;
    return tracks.findIndex(track => track.id === playbackState.currentTrack?.id);
  }, [tracks, playbackState.currentTrack]);

  // Skip to previous track
  const handlePrevious = useCallback(async () => {
    // Previous now plays a random track
    try {
      // Set user interaction flag for mobile autoplay
      setHasUserInteracted(true);
      const res = await api.getRandomTrack();
      if (res.success && res.data?.track) {
        const t = res.data.track;
        setTracks([t]);
        setError(null);
        const response = await api.playTrack(t.id);
        if (response.success) {
          setPlaybackState(prev => ({ ...prev, isPlaying: true, currentTrack: t }));
          if (t.id) {
            await analytics.startListeningSession(t.id);
            setAnalyticsRefreshTrigger(prev => prev + 1);
          }
        } else {
          setError(response.error || 'Failed to play track');
        }
      }
    } catch (e) {
      console.error('Failed to play previous (random):', e);
    }
  }, [analytics]);

  // Skip to next track
  const handleNext = useCallback(async () => {
    // Next respects playback mode (random/sequential)
    try {
      // Set user interaction flag for mobile autoplay
      setHasUserInteracted(true);
      const t = await getNextTrack();
      if (t) {
        setTracks([t]);
        setError(null);
        const response = await api.playTrack(t.id);
        if (response.success) {
          setPlaybackState(prev => ({ ...prev, isPlaying: true, currentTrack: t }));
          if (t.id) {
            await analytics.startListeningSession(t.id);
            setAnalyticsRefreshTrigger(prev => prev + 1);
          }
        } else {
          setError(response.error || 'Failed to play track');
        }
      }
    } catch (e) {
      console.error('Failed to play next (random):', e);
    }
  }, [analytics, getNextTrack]);

  // Initialize reasonable volume on first load
  useEffect(() => {
    const initializeVolume = async () => {
      try {
        const state = await api.getPlaybackState();
        if (state.success && state.data) {
          const backendVolume = state.data.volume;
          
          // If backend volume seems unreasonable (> 100 suggests it's in wrong scale), fix it
          if (backendVolume > 100) {
            await api.setVolume(80);
          }
        }
      } catch (error) {
        console.error('Failed to initialize volume:', error);
      }
    };
    
    initializeVolume();
  }, []); // Run once on mount

  // Poll for playback state updates
  useEffect(() => {
    const pollPlaybackState = async () => {
      try {
        const response = await api.getPlaybackState();
        
        if (response.success && response.data) {
          const state = response.data;
          setPlaybackState(state);

          // Sync HTML5 audio element with backend state
          if (audioRef.current && state.currentTrack) {
            const audioUrl = `${API_BASE}/playback/audio/${state.currentTrack.id}`;
            
            if (localPlayback) {
              // Update audio source if different
              if (audioRef.current.src !== audioUrl) {
                audioRef.current.src = audioUrl;
                audioRef.current.load();
              }
            
              // Sync playback state - only play if user has interacted
              if (state.isPlaying && audioRef.current.paused) {
                if (hasUserInteracted) {
                  audioRef.current.play().catch(error => {
                    console.error('Audio play failed:', error);
                    setShowAutoplayHelp(true);
                  });
                } else {
                  setShowAutoplayHelp(true);
                }
              } else if (!state.isPlaying && !audioRef.current.paused) {
                audioRef.current.pause();
              }
            
              // Sync volume (backend returns 0-100, audio element expects 0-1)
              // But only if user is not currently adjusting the volume slider
              if (!isUserAdjustingVolume.current) {
                // Ensure volume is always normalized to 0-1 range
                const normalizedVolume = state.volume > 1 ? state.volume / 100 : state.volume;
                const clampedVolume = Math.max(0, Math.min(1, normalizedVolume));
                
                audioRef.current.volume = clampedVolume;
                
                // Update local state to match backend (avoid fighting with the slider)
                setPlaybackState(prev => ({ 
                  ...prev, 
                  volume: clampedVolume
                }));
                      }
            
              // Seek if needed (basic sync)
              if (Math.abs((audioRef.current.currentTime || 0) - (state.position || 0)) > 2) {
                audioRef.current.currentTime = state.position || 0;
              }
            } else {
              // Remote control mode: ensure local audio is not playing
              if (!audioRef.current.paused) audioRef.current.pause();
              if (audioRef.current.src) {
                audioRef.current.removeAttribute('src');
                audioRef.current.load();
              }
            }
          }
        }
      } catch (error) {
        console.error('Failed to fetch playback state:', error);
      }
    };

    // Poll every 1 second
    const interval = setInterval(pollPlaybackState, 1000);
    pollPlaybackState(); // Initial call

    return () => clearInterval(interval);
  }, [hasUserInteracted, localPlayback]);

  // Auto-advance: when the audio element ends, play a new random track
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      handleNext();
    };
    audio.addEventListener('ended', onEnded);
    return () => {
      audio.removeEventListener('ended', onEnded);
    };
  }, [handleNext]);

  const handlePlay = useCallback(async (trackId?: string) => {
    try {
      setError(null);
      setHasUserInteracted(true);
      
      if (!trackId) {
        console.error('No track ID provided');
        setError('No track selected');
        return;
      }
      
      const response = await api.playTrack(trackId);
      
      if (response.success) {
        const track = tracks.find(t => t.id === trackId);
        
        // Update local state immediately for better UX
        setPlaybackState(prev => ({
          ...prev,
          isPlaying: true,
          currentTrack: track || prev.currentTrack
        }));
        
        // Start analytics session for the new track
        if (track?.id) {
          await analytics.startListeningSession(track.id);
          // Trigger analytics refresh for Recently Played and Full History
          setAnalyticsRefreshTrigger(prev => prev + 1);
        }
        
      } else {
        setError(response.error || 'Failed to play track');
      }
    } catch (error) {
      console.error('Failed to play track:', error);
      setError('Failed to play track');
    }
  }, [tracks, analytics]);

  const handlePause = useCallback(async () => {
    try {
      setError(null);
      setHasUserInteracted(true);
      
      await api.pausePlayback();
      setPlaybackState(prev => ({ ...prev, isPlaying: false }));
      
      // Track pause event for analytics
      analytics.handlePause();
      
    } catch (error) {
      console.error('Failed to pause track:', error);
      setError('Failed to pause track');
    }
  }, [analytics]);


  const handleVolumeChange = useCallback(async (value: number[]) => {
    const volume = Math.round(value[0] * 100);
    try {
      await api.setVolume(volume);
      setPlaybackState(prev => ({ ...prev, volume }));
    } catch (error) {
      console.error('Failed to set volume:', error);
    }
  }, []);

  const handleSeek = useCallback(async (event: React.MouseEvent<HTMLDivElement>) => {
    if (!playbackState.currentTrack?.duration) return;

    // Set user interaction flag for mobile autoplay
    setHasUserInteracted(true);

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newPosition = percentage * playbackState.currentTrack.duration;

    // Update local state immediately for responsiveness
    setPlaybackState(prev => ({ ...prev, position: newPosition }));
    
    
    // Also call backend seek API
    try {
      await api.seek(newPosition);
    } catch (error) {
      console.error('Seek API call failed:', error);
    }
    
    console.log('Seeking to:', newPosition);
  }, [playbackState.currentTrack]);

  // Add audio event listeners for analytics tracking
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      analytics.handleTimeUpdate(audio.currentTime);
    };

    const handlePlay = () => {
      analytics.handlePlay();
    };

    const handlePause = () => {
      analytics.handlePause();
    };

    const handleEnded = () => {
      analytics.handleTrackEnd();
      // Auto-advance to next track
      handleNext();
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('play', handlePlay);
    audio.addEventListener('pause', handlePause);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('play', handlePlay);
      audio.removeEventListener('pause', handlePause);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [analytics, handleNext]);

  // Rating functions
  const handleIncrementRating = useCallback(async (trackId: string) => {
    console.log('[RATING] Incrementing rating for track:', trackId);
    try {
      const result = await analytics.incrementRating(trackId);
      console.log('[RATING] Increment result:', result);
      // Trigger analytics refresh
      setAnalyticsRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to increment rating:', error);
    }
  }, [analytics]);

  const handleDecrementRating = useCallback(async (trackId: string) => {
    console.log('[RATING] Decrementing rating for track:', trackId);
    try {
      const result = await analytics.decrementRating(trackId);
      console.log('[RATING] Decrement result:', result);
      // Trigger analytics refresh
      setAnalyticsRefreshTrigger(prev => prev + 1);
    } catch (error) {
      console.error('Failed to decrement rating:', error);
    }
  }, [analytics]);

  // Note: Track filtering is now handled by the SearchResults component

  // Format time helper function
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleDownload = useCallback(async () => {
    if (!downloadUrl.trim()) return;
    const url = downloadUrl.trim();
    setIsDownloading(true);
    setError(null);

    const isPlaylistUrl = /[?&]list=|playlist/i.test(url);

    try {
      if (isPlaylistUrl) {
        const res = await api.downloadPlaylist(url);
        if (res.success && res.data) {
          console.log('[DOWNLOAD] Playlist response:', res.data);
          // Seed jobs from response
          const jobs = res.data.jobs || [];
          if (jobs.length > 0) {
            setDownloadJobs(prev => [
              ...jobs.map(j => ({
                jobId: j.jobId,
                title: j.title,
                artist: j.artist,
                album: j.album,
                youtubeId: j.youtubeId,
                status: 'pending' as const,
                progress: 0,
                stallDetected: false,
                stallSecondsRemaining: undefined,
                retrying: false,
              })),
              ...prev,
            ]);
          } else if ((res.data as any).tracksQueued > 0) {
            // No job IDs returned (unexpected). Show placeholder entry so user sees activity.
            setDownloadJobs(prev => [
              {
                jobId: `placeholder_${Date.now()}`,
                title: `Queued ${(res.data as any).tracksQueued} tracks…`,
                status: 'pending' as const,
                progress: 0,
                stallDetected: false,
                stallSecondsRemaining: undefined,
                retrying: false,
              },
              ...prev,
            ]);
          }
        } else {
          setError(res.error || 'Failed to start playlist download');
        }
      } else {
        const res = await api.downloadAudio(url);
        const jobId = res.data?.jobId;
        if (res.success && typeof jobId === 'string') {
          setDownloadJobs(prev => [
            {
              jobId,
              title: 'Single video',
              status: 'pending' as const,
              progress: 0,
              stallDetected: false,
              stallSecondsRemaining: undefined,
              retrying: false,
            },
            ...prev,
          ]);
        } else if (!res.success) {
          setError(res.error || 'Failed to start download');
        }
      }

      // Clear field but keep spinner while jobs are active
      setDownloadUrl('');
    } catch (error) {
      console.error('Download failed:', error);
      setError('Download failed');
    }
  }, [downloadUrl]);

  // Poll progress for active download jobs (disabled when SSE is connected)
  useEffect(() => {
    let cancelled = false;
    if (currentView !== 'download') return;
    // If SSE is connected, skip polling to reduce render pressure
    if ((window as any).__sseDownloadConnected) return;
    if (downloadJobs.length === 0) return;

    const poll = async () => {
      try {
        const updates = await Promise.all(
          downloadJobs.map(async job => {
            // Stop polling completed/failed jobs
            if (job.status === 'completed' || job.status === 'failed') return job;
            try {
              const progress = await api.getDownloadProgress(job.jobId);
              if (progress && (progress as any).success) {
                return {
                  ...job,
                  status: (progress as any).status,
                  progress: (progress as any).progress,
                  title: (progress as any).title || job.title,
                  artist: (progress as any).artist || job.artist,
                  album: (progress as any).album || job.album,
                  youtubeId: (progress as any).youtubeId || job.youtubeId,
                  errorMessage: (progress as any).errorMessage ?? job.errorMessage,
                  errorCode: (progress as any).errorCode ?? job.errorCode,
                  stallDetected: (progress as any).stallDetected ?? job.stallDetected,
                  stallSecondsRemaining: (progress as any).stallSecondsRemaining ?? job.stallSecondsRemaining,
                };
              }
              // If backend didn't return success, mark job as failed to halt polling noise
              return { ...job, status: 'failed' as const };
            } catch (e) {
              // Mark job as failed on repeated errors to avoid endless polling
              return { ...job, status: 'failed' as const };
            }
          })
        );

        if (!cancelled) {
          setDownloadJobs(updates);

          // If all jobs are done, refresh track list
          const allDone = updates.every(j => j.status === 'completed' || j.status === 'failed');
          if (allDone) {
            try {
              const response = await api.getTracks();
              if (response.success && response.data) setTracks(response.data.tracks);
            } catch {}
          }
        }
      } catch (e) {
        console.error('Download polling error', e);
      }
    };

    const interval = setInterval(poll, 1000);
    // kick initial poll quickly
    poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [currentView, downloadJobs.length]);

  // Real-time download events via SSE
  useEffect(() => {
    if (currentView !== 'download') return;
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${API_BASE}/download/stream`);
      es.onopen = () => { (window as any).__sseDownloadConnected = true; };
      const onDownload = (ev: MessageEvent) => {
        try {
          const evt = JSON.parse(ev.data || '{}');
          const { type, jobId, data } = evt || {};

          // Album completion is handled by separate SSE connection
          if (type === 'album_completed') return;

          if (type === 'playlist_summary') {
            setPlaylistSummaries(prev => [{
              albumName: data?.albumName || 'Unknown Album',
              totalTracks: data?.totalTracks ?? 0,
              completedTracks: data?.completedTracks ?? 0,
              failed: Array.isArray(data?.failed) ? data.failed : [],
              receivedAt: new Date(),
            }, ...prev.slice(0, 4)]);
            return;
          }

          if (!jobId) return;
          setDownloadJobs(prev => {
            const existing = prev.find(j => j.jobId === jobId);
            const base = existing || {
              jobId,
              title: undefined as string | undefined,
              artist: undefined as string | undefined,
              album: undefined as string | undefined,
              youtubeId: undefined as string | undefined,
              errorMessage: undefined as string | undefined,
              errorCode: undefined as string | undefined,
              stallDetected: false,
              stallSecondsRemaining: undefined,
              retrying: false,
              status: 'pending' as const,
              progress: 0,
            };
            const next = { ...base };
            if (data) {
              if (data.title) next.title = data.title;
              if (data.artist) next.artist = data.artist;
              if (data.album) next.album = data.album;
              if (data.youtubeId) next.youtubeId = data.youtubeId;
              if (typeof data.progress === 'number') next.progress = Math.max(0, Math.min(100, Math.round(data.progress)));
              if (data.message) next.errorMessage = data.message;
              if (data.errorMessage) next.errorMessage = data.errorMessage;
              if (data.errorCode) next.errorCode = data.errorCode;
              if (data.code) next.errorCode = data.code;
              if (typeof data.stallSecondsRemaining === 'number') next.stallSecondsRemaining = data.stallSecondsRemaining;
              if (typeof data.stallDetected === 'boolean') next.stallDetected = data.stallDetected;
            }
            if (type === 'started') {
              next.status = 'downloading';
              next.retrying = false;
            } else if (type === 'progress') {
              next.status = 'downloading';
            } else if (type === 'completed') {
              next.status = 'completed';
              next.progress = 100;
              next.stallDetected = false;
              next.stallSecondsRemaining = undefined;
            } else if (type === 'failed') {
              next.status = 'failed';
              if (!next.errorMessage && typeof data === 'string') next.errorMessage = data;
              next.stallDetected = false;
              next.stallSecondsRemaining = undefined;
              next.retrying = false;
            } else if (type === 'stall_detected') {
              next.status = 'downloading';
              next.stallDetected = true;
              next.stallSecondsRemaining = typeof data?.stallSecondsRemaining === 'number' ? data.stallSecondsRemaining : next.stallSecondsRemaining ?? 120;
              if (data?.message) next.errorMessage = data.message;
            } else if (type === 'stall_timeout') {
              next.status = 'failed';
              next.stallDetected = false;
              next.stallSecondsRemaining = undefined;
              next.retrying = false;
              if (data?.message) next.errorMessage = data.message;
            } else if (type === 'stall_cleared') {
              next.stallDetected = false;
              next.stallSecondsRemaining = undefined;
            } else if (type === 'retry_started') {
              next.retrying = true;
            }
            // Upsert and deduplicate by jobId to avoid duplicate keys
            const updated = existing
              ? prev.map(j => (j.jobId === jobId ? next : j))
              : [next, ...prev];
            const map = new Map<string, typeof next>();
            for (const j of updated) {
              map.set(j.jobId, map.has(j.jobId) ? { ...map.get(j.jobId)!, ...j } : j);
            }
            return Array.from(map.values());
          });
        } catch {}
      };
      es.addEventListener('download', onDownload as any);
      es.onerror = () => { (window as any).__sseDownloadConnected = false; };
    } catch (e) {
      console.warn('SSE connection failed:', e);
    }
    return () => {
      try { es?.close(); } catch {}
      (window as any).__sseDownloadConnected = false;
    };
  }, [currentView]);

  // Album completion events via SSE (always active regardless of view)
  useEffect(() => {
    let es: EventSource | null = null;
    try {
      es = new EventSource(`${API_BASE}/download/stream`);
      const onAlbumCompletion = (ev: MessageEvent) => {
        try {
          const evt = JSON.parse(ev.data || '{}');
          const { type, data } = evt || {};

          // Only handle album completion events
          if (type === 'album_completed') {
            console.log('[FRONTEND] Album completion received:', data);
            console.log('[FRONTEND] Track IDs received:', data?.trackIds);
            setCompletedAlbums(prev => [
              {
                albumName: data?.albumName || 'Unknown Album',
                totalTracks: data?.totalTracks || 0,
                completedAt: new Date(),
                trackIds: data?.trackIds || []
              },
              ...prev
            ]);
          }
        } catch (e) {
          console.error('Album completion SSE error:', e);
        }
      };
      es.addEventListener('download', onAlbumCompletion as any);
    } catch (e) {
      console.warn('Album completion SSE connection failed:', e);
    }
    return () => {
      try { es?.close(); } catch {}
    };
  }, []); // No dependencies - always active

  return (
    <div className={cn("h-screen flex flex-col bg-gray-900 text-white", className)}>
      {/* Hidden Audio Element */}
      <audio 
        ref={audioRef}
        preload="none"
        playsInline
        onError={(e) => {
          const target = e.currentTarget as HTMLAudioElement;
          const error = target.error;
          const errorDetails = {
            code: error?.code,
            message: error?.message,
            src: target.src,
            networkState: target.networkState,
            readyState: target.readyState
          };
          console.error('Audio element error:', errorDetails);
          
          // Provide user-friendly error message based on error code
          let errorMsg = 'Audio playback error';
          if (error?.code === 1) errorMsg = 'Audio loading aborted';
          else if (error?.code === 2) errorMsg = 'Network error loading audio';
          else if (error?.code === 3) errorMsg = 'Audio decoding failed';
          else if (error?.code === 4) errorMsg = 'Audio format not supported';
          
          setError(errorMsg);
        }}
        className="hidden"
      />
      
      {/* Main Player */}
      <div className="bg-gray-900">
        <div className="flex items-center justify-between p-3 gap-3">
          {/* Heatmap Timeline with Playback Hotspots */}
          <div className="flex-1 px-4">
            {playbackState.currentTrack ? (
              <HeatmapTimeline
                trackId={playbackState.currentTrack.id}
                trackDuration={playbackState.currentTrack.duration || 0}
                currentPosition={playbackState.position || 0}
                height={50}
                onSeek={async (position) => {
                  // Update local state immediately for responsiveness
                  setPlaybackState(prev => ({ ...prev, position }));
                  
                  // Also call backend seek API
                  try {
                    await api.seek(position);
                  } catch (error) {
                    console.error('Seek API call failed:', error);
                  }
                }}
              />
            ) : (
              <div className="flex items-center gap-3 w-full">
                <span className="text-xs text-gray-400 min-w-[40px] text-center font-mono">0:00</span>
                <div className="flex-1 bg-gray-800 border border-gray-600 rounded" style={{ height: '50px' }}>
                  <div className="flex items-center justify-center h-full text-gray-500 text-sm">
                    No track loaded
                  </div>
                </div>
                <span className="text-xs text-gray-400 min-w-[40px] text-center font-mono">0:00</span>
              </div>
            )}
          </div>

        </div>
        
        

        {/* Centered Playback Controls */}
        <div className="flex justify-center p-3">
          <div className="flex items-center gap-3">
            <Button 
              onClick={handlePrevious}
              disabled={false}
              variant="ghost" 
              className="h-[50px] w-[50px] p-0"
              title="Previous"
            >
              <BackwardIcon className="w-5 h-5" />
            </Button>
            <Button
              onClick={playbackState.isPlaying ? handlePause : () => handlePlay(playbackState.currentTrack?.id)}
              disabled={!playbackState.currentTrack}
              className="h-[50px] w-[50px] p-0 rounded-full"
              title={playbackState.isPlaying ? 'Pause' : 'Play'}
            >
              {playbackState.isPlaying ? (
                <PauseIcon className="w-6 h-6" />
              ) : (
                <PlayIcon className="w-6 h-6" />
              )}
            </Button>
            <Button 
              onClick={handleNext}
              disabled={false}
              variant="ghost" 
              className="h-[50px] w-[50px] p-0"
              title="Next"
            >
              <ForwardIcon className="w-5 h-5" />
            </Button>
          </div>
        </div>

        {/* Track Info Row */}
        {playbackState.currentTrack && (
          <div className="text-center pb-3">
            <div className="font-medium text-sm truncate">{playbackState.currentTrack.title}</div>
            <div className="text-xs text-gray-400 truncate">
              {playbackState.currentTrack.artist}
              {playbackState.currentTrack.album && ` • ${playbackState.currentTrack.album.replace(/^Album - /, '')}`}
            </div>
            {/* Local playback toggle button under metadata */}
            <div className="mt-2 flex items-center justify-center">
              <Button
                onClick={() => setLocalPlayback((v) => !v)}
                size="sm"
                variant={localPlayback ? 'default' : 'outline'}
                aria-pressed={localPlayback}
                title="Play audio locally on this device"
              >
                Play on this device {localPlayback ? 'ON' : 'OFF'}
              </Button>
            </div>
            {/* Plus / Minus action buttons under metadata */}
            <div className="mt-2 flex items-center justify-center gap-2">
              <Button
                onClick={() => playbackState.currentTrack?.id && handleIncrementRating(playbackState.currentTrack.id)}
                className="h-[50px] w-[50px] p-0"
                variant="outline"
                title="Increase rating"
              >
                <PlusIcon className="w-5 h-5" />
              </Button>
              <Button
                onClick={() => playbackState.currentTrack?.id && handleDecrementRating(playbackState.currentTrack.id)}
                className="h-[50px] w-[50px] p-0"
                variant="outline"
                title="Decrease rating"
              >
                <MinusIcon className="w-5 h-5" />
              </Button>
            </div>
            
            {/* Volume Control */}
            <div className="mt-3 px-4">
              <div className="flex items-center gap-2">
                <SpeakerWaveIcon className="w-4 h-4 text-gray-400 flex-shrink-0" />
                <Slider
                  value={[Math.round(Math.max(0, Math.min(1, playbackState.volume)) * 100)]}
                  onValueChange={async (value) => {
                    const volumePercent = value[0];
                    const newVolume = volumePercent / 100;

                    // Set user interaction flag for mobile autoplay
                    setHasUserInteracted(true);

                    // Mark that user is adjusting volume (prevent polling override)
                    isUserAdjustingVolume.current = true;
                    
                    // Update local state immediately for responsive UI
                    setPlaybackState(prev => ({ ...prev, volume: newVolume }));
                    
                    // Apply volume to audio element immediately
                    if (audioRef.current) {
                      audioRef.current.volume = newVolume;
                    }
                    
                    // Send to backend API to persist the volume
                    try {
                      await api.setVolume(volumePercent);
                    } catch (error) {
                      console.error('Failed to update volume on backend:', error);
                    }
                    
                    // After a longer delay, allow polling to resume
                    setTimeout(() => {
                      isUserAdjustingVolume.current = false;
                    }, 3000); // 3 second delay to prevent snapping
                  }}
                  max={100}
                  min={0}
                  step={1}
                  className="flex-1"
                />
                <span className="text-xs text-gray-400 w-12 text-right">
                  {Math.round(Math.max(0, Math.min(1, playbackState.volume)) * 100)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-600 text-white p-2 text-sm">
          {error}
        </div>
      )}

      {/* Autoplay Help Banner */}
      {showAutoplayHelp && (
        <div className="bg-amber-500/20 border border-amber-500 text-amber-200 p-3 text-sm flex items-center justify-between">
          <div className="pr-3">
            <div className="font-medium">Audio playback requires user interaction.</div>
            <div className="opacity-80">
              Click any button or the play button to start audio playback.
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setShowAutoplayHelp(false);
                setHasUserInteracted(true);
                if (playbackState.currentTrack?.id) {
                  handlePlay(playbackState.currentTrack.id);
                }
              }}
            >
              Enable Audio
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        {currentView === 'library' && (
          <div className="h-full flex flex-col">
            {/* Search Bar */}
            <div className="p-4 border-b border-gray-700">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search artists, albums, and songs..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                />
              </div>
            </div>

            {/* Enhanced Search Results */}
            <SearchResults
              query={searchQuery}
              onPlayTrack={handlePlay}
              onIncrementRating={handleIncrementRating}
              onDecrementRating={handleDecrementRating}
              getTrackRating={analytics.getTrackRating}
              currentTrackId={playbackState.currentTrack?.id}
              isPlaying={playbackState.isPlaying}
              onArtistClick={handleArtistClick}
              onAlbumClick={handleAlbumClick}
            />
          </div>
        )}

        {currentView === 'queue' && (
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">Queue</h2>
            {playbackState.queue.length === 0 ? (
              <p className="text-gray-400">No tracks in queue</p>
            ) : (
              <div className="space-y-2">
                {playbackState.queue.map((track, index) => (
                  <div key={`${track.youtubeId}-${index}`} className="flex items-center justify-between p-2 bg-gray-800 rounded">
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate">{track.title}</div>
                      <div className="text-sm text-gray-400 truncate">{track.artist}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentView === 'download' && (
          <div className="p-4">
            <h2 className="text-lg font-semibold mb-4">Download Track</h2>
            <div className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Enter YouTube URL..."
                value={downloadUrl}
                onChange={(e) => setDownloadUrl(e.target.value)}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-600 rounded text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
              />
              <Button
                onClick={handleDownload}
                disabled={!downloadUrl.trim() || isDownloading}
              >
                {isDownloading ? 'Downloading...' : 'Download'}
              </Button>
            </div>

            {/* Playlist Summaries */}
            {playlistSummaries.length > 0 && (
              <div className="space-y-3 mb-4">
                <h3 className="text-md font-semibold text-blue-300 flex items-center gap-2">
                  Latest Playlist Summaries
                </h3>
                {playlistSummaries.map((summary, index) => (
                  <div key={`${summary.albumName}-${index}`} className="bg-blue-900/30 border border-blue-700/40 rounded p-4 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-blue-100">
                          {summary.albumName}
                        </div>
                        <div className="text-xs text-blue-200/80">
                          {summary.completedTracks}/{summary.totalTracks} tracks downloaded • {summary.receivedAt.toLocaleTimeString()}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-blue-200 hover:text-white"
                        onClick={() => setPlaylistSummaries(prev => prev.filter((_, i) => i !== index))}
                      >
                        ✕
                      </Button>
                    </div>
                    {summary.failed.length > 0 ? (
                      <div className="text-xs text-red-200 space-y-1">
                        <div className="font-medium text-red-300">Failed Tracks</div>
                        {summary.failed.map((track, idx) => (
                          <div key={`${track.youtubeId}-${idx}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                            <span>
                              {track.title || 'Unknown Track'} {track.youtubeId ? `(${track.youtubeId})` : ''}
                            </span>
                            {track.reason && <span className="opacity-80">Reason: {track.reason}</span>}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-xs text-green-200">
                        All tracks downloaded successfully.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Completed Albums */}
            {completedAlbums.length > 0 && (
              <div className="mt-4 space-y-3 mb-4">
                <h3 className="text-md font-semibold text-green-400">✅ Completed Albums</h3>
                {completedAlbums.map((album, index) => (
                  <div key={index} className="bg-green-900/20 rounded p-4 border border-green-700/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-medium text-green-100">
                          The "{album.albumName}" has been downloaded
                        </div>
                        <div className="text-xs text-green-300">
                          {album.totalTracks} tracks • {album.completedAt.toLocaleTimeString()}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => handlePlayAlbum(album)}
                          className="bg-green-600 hover:bg-green-700 text-white"
                          size="sm"
                        >
                          Play Album
                        </Button>
                        <Button
                          onClick={() => setCompletedAlbums(prev => prev.filter((_, i) => i !== index))}
                          variant="ghost"
                          size="sm"
                          className="text-green-300 hover:text-white"
                        >
                          ✕
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Progress Header & List */}
            {smoothedDownloadJobs.length > 0 && (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-2">
                <div className="text-xs text-gray-400 px-1">
                  Showing {smoothedDownloadJobs.length} job{smoothedDownloadJobs.length === 1 ? '' : 's'}. {(window as any).__sseDownloadConnected ? 'Live (SSE)' : 'Polling every second'}.
                </div>
                {smoothedDownloadJobs.map(job => (
                  <div key={job.jobId} className="bg-gray-800 rounded p-3 border border-gray-700">
                    <div className="text-sm font-medium truncate">
                      {job.title || 'Downloading'} {job.album ? `• ${job.album}` : ''}
                    </div>
                    <div className="text-xs text-gray-400 truncate mb-2">
                      {job.artist || ''} {job.youtubeId ? `• ${job.youtubeId}` : ''}
                    </div>
                    <div className="w-full h-2 bg-gray-700 rounded overflow-hidden">
                      <div
                        className={`h-full ${job.status === 'failed' ? 'bg-red-500' : job.status === 'completed' ? 'bg-green-500' : 'bg-blue-500'}`}
                        style={{ width: `${Math.max(0, Math.min(100, job.progress ?? 0))}%` }}
                      />
                    </div>
                    <div className="mt-1 text-xs text-gray-300 flex flex-col gap-1">
                      <span>
                        Status: {job.status ?? 'pending'} • {Math.round(job.progress ?? 0)}%
                      </span>
                      {job.stallDetected && job.status === 'downloading' && (
                        <span className="text-amber-300">
                          Detected stall – retrying in {Math.max(0, job.stallSecondsRemaining ?? 0)}s
                        </span>
                      )}
                      {job.stallDetected && job.status === 'downloading' && job.stallSecondsRemaining !== undefined && job.stallSecondsRemaining <= 0 && (
                        <span className="text-red-300">Download stalled. Auto retry imminent…</span>
                      )}
                      {job.retrying && <span className="text-blue-300">Retry in progress…</span>}
                    </div>
                    {job.errorMessage && (
                      <div className="mt-1 text-xs text-red-300">
                        {job.errorMessage}
                        {job.errorCode ? ` (code: ${job.errorCode})` : ''}
                      </div>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {job.stallDetected && job.status === 'downloading' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={job.retrying}
                            onClick={() => handleStopAndRetry(job.jobId)}
                          >
                            {job.retrying ? 'Stopping…' : 'Stop & Retry'}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={job.retrying}
                            onClick={() => handleCancel(job.jobId)}
                          >
                            Cancel
                          </Button>
                        </>
                      )}
                      {job.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="default"
                          disabled={job.retrying}
                          onClick={() => handleStopAndRetry(job.jobId)}
                        >
                          {job.retrying ? 'Retrying…' : 'Retry download'}
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Playback Mode Toggle */}
            <div className="mt-6 pt-4 border-t border-gray-700">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Playback Mode</span>
                <Button
                  onClick={() => setPlaybackMode(prev => prev === 'random' ? 'sequential' : 'random')}
                  variant="outline"
                  size="sm"
                  className="border-gray-600 text-gray-300 hover:bg-gray-700"
                >
                  {playbackMode === 'random' ? '🔀 Random' : '▶️ Sequential'}
                </Button>
              </div>
            </div>
          </div>
        )}

        {currentView === 'analytics' && (
          <AnalyticsDashboard
            onPlayTrack={handlePlay}
            onIncrementRating={handleIncrementRating}
            onDecrementRating={handleDecrementRating}
            getTrackRating={analytics.getTrackRating}
            playbackState={playbackState}
            tracks={tracks}
            refreshTrigger={analyticsRefreshTrigger}
          />
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="flex border-t border-gray-700 bg-gray-900">
        <Button
          onClick={() => setCurrentView('library')}
          variant={currentView === 'library' ? 'default' : 'ghost'}
          className="flex-1 rounded-none h-12 flex items-center justify-center gap-2 text-sm"
        >
          <MagnifyingGlassIcon className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Library</span>
        </Button>
        <Button
          onClick={() => setCurrentView('queue')}
          variant={currentView === 'queue' ? 'default' : 'ghost'}
          className="flex-1 rounded-none h-12 flex items-center justify-center gap-2 text-sm"
        >
          <ListBulletIcon className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Queue</span>
        </Button>
        <Button
          onClick={() => setCurrentView('analytics')}
          variant={currentView === 'analytics' ? 'default' : 'ghost'}
          className="flex-1 rounded-none h-12 flex items-center justify-center gap-2 text-sm"
        >
          <ChartBarIcon className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Analytics</span>
        </Button>
        <Button
          onClick={() => setCurrentView('download')}
          variant={currentView === 'download' ? 'default' : 'ghost'}
          className="flex-1 rounded-none h-12 flex items-center justify-center gap-2 text-sm"
        >
          <ArrowDownTrayIcon className="w-4 h-4 flex-shrink-0" />
          <span className="hidden sm:inline">Download</span>
        </Button>
      </div>
    </div>
  );
};

export default IntegratedPlayer;
