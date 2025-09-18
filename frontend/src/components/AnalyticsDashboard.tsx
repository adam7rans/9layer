'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, Track } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { 
  PlayIcon, 
  PauseIcon,
  PlusIcon,
  MinusIcon,
  ClockIcon,
  HeartIcon,
  ChartBarIcon,
  FunnelIcon,
  EyeIcon,
  ListBulletIcon,
  ChevronDownIcon,
  ChevronUpIcon
} from '@heroicons/react/24/solid';
// import { cn } from '@/lib/utils';
import PlaybackTimeline from './PlaybackTimeline';

interface AnalyticsData {
  topTracks: any[];
  recentlyPlayed: any[];
  listeningHistory: any[];
  ratedTracks: any[];
}

interface AnalyticsDashboardProps {
  onPlayTrack: (trackId?: string) => void;
  onIncrementRating: (trackId: string) => void;
  onDecrementRating: (trackId: string) => void;
  getTrackRating: (trackId: string) => number;
  playbackState: any;
  tracks: Track[];
  refreshTrigger?: number; // Add this to trigger refreshes
}

const AnalyticsDashboard = ({ 
  onPlayTrack, 
  onIncrementRating, 
  onDecrementRating, 
  getTrackRating,
  playbackState,
  tracks,
  refreshTrigger 
}: AnalyticsDashboardProps) => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    topTracks: [],
    recentlyPlayed: [],
    listeningHistory: [],
    ratedTracks: []
  });
  const [activeTab, setActiveTab] = useState<'top' | 'recent' | 'history' | 'rated' | 'most-played'>('top');
  const [loading, setLoading] = useState(true);
  const [ratedFilter, setRatedFilter] = useState<'all' | 'positive' | 'negative'>('all');
  const [mostPlayedViewMode, setMostPlayedViewMode] = useState<'simple' | 'detailed'>('simple');
  const [detailedData, setDetailedData] = useState<Map<string, any>>(new Map());
  const [loadingDetailedData, setLoadingDetailedData] = useState<Set<string>>(new Set());

  // Format time helper
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Format date helper
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Load analytics data
  const loadAnalyticsData = useCallback(async () => {
    setLoading(true);
    try {
      const [topTracksRes, historyRes, ratedTracksRes] = await Promise.all([
        api.analytics.getTopTracks('default', 50),
        api.analytics.getHistory('default', 100),
        api.analytics.getRatedTracks('default', ratedFilter)
      ]);

      const newData: AnalyticsData = {
        topTracks: topTracksRes.success ? topTracksRes.data : [],
        recentlyPlayed: [],
        listeningHistory: historyRes.success ? historyRes.data : [],
        ratedTracks: ratedTracksRes.success ? ratedTracksRes.data : []
      };

      // Extract recently played from history (last 20 unique tracks)
      const recentTrackIds = new Set();
      newData.recentlyPlayed = newData.listeningHistory
        .filter(session => {
          if (recentTrackIds.has(session.track.id)) return false;
          recentTrackIds.add(session.track.id);
          return true;
        })
        .slice(0, 20);

      setAnalyticsData(newData);
    } catch (error) {
      console.error('Failed to load analytics data:', error);
    } finally {
      setLoading(false);
    }
  }, [ratedFilter]);

  useEffect(() => {
    loadAnalyticsData();
  }, [loadAnalyticsData]);

  // Refresh data when refreshTrigger changes (ratings or new plays)
  useEffect(() => {
    if (refreshTrigger) {
      loadAnalyticsData();
    }
  }, [refreshTrigger, loadAnalyticsData]);

  // Filter tracks by rating (unused but kept for potential future use)
  // const getFilteredRatedTracks = () => {
  //   const ratedTracks = tracks
  //     .map(track => ({
  //       ...track,
  //       rating: getTrackRating(track.id || '')
  //     }))
  //     .filter(track => {
  //       if (ratedFilter === 'positive') return track.rating > 0;
  //       if (ratedFilter === 'negative') return track.rating < 0;
  //       return track.rating !== 0; // 'all' shows any rated track
  //     })
  //     .sort((a, b) => b.rating - a.rating);

  //   return ratedTracks;
  // };

  // Get most played tracks (from analytics data)
  const getMostPlayedTracks = () => {
    const trackPlayCounts = new Map();
    const uniqueTracks = new Map();
    
    // Count plays and collect unique track info
    analyticsData.listeningHistory.forEach(session => {
      const trackId = session.track.id;
      trackPlayCounts.set(trackId, (trackPlayCounts.get(trackId) || 0) + 1);
      
      // Store track info (will be overwritten but that's fine since it's the same track)
      uniqueTracks.set(trackId, session.track);
    });

    // Build array of tracks with play counts
    const mostPlayedList = Array.from(uniqueTracks.entries())
      .map(([trackId, track]) => ({
        ...track,
        playCount: trackPlayCounts.get(trackId) || 0
      }))
      .filter(track => track.playCount > 0)
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 50);

    return mostPlayedList;
  };

  // Load detailed data for all tracks when switching to detailed view
  const loadAllDetailedData = async (tracks: any[]) => {
    const trackIds = tracks.map(track => track.id || track.youtubeId).slice(0, 10); // Limit to first 10 for performance
    const newLoadingSet = new Set(loadingDetailedData);
    
    for (const trackId of trackIds) {
      if (!detailedData.has(trackId) && !loadingDetailedData.has(trackId)) {
        newLoadingSet.add(trackId);
        setLoadingDetailedData(newLoadingSet);
        
        try {
          const response = await api.analytics.getDetailedTrackHistory(trackId, 'default');
          if (response.success) {
            const newDetailedData = new Map(detailedData);
            newDetailedData.set(trackId, response.data);
            setDetailedData(newDetailedData);
          }
        } catch (error) {
          console.error('Failed to fetch detailed track data:', error);
        } finally {
          const updatedLoadingSet = new Set(newLoadingSet);
          updatedLoadingSet.delete(trackId);
          setLoadingDetailedData(updatedLoadingSet);
        }
      }
    }
  };

  // Load detailed data when switching to detailed mode
  useEffect(() => {
    if (mostPlayedViewMode === 'detailed' && activeTab === 'most-played') {
      const mostPlayed = getMostPlayedTracks();
      if (mostPlayed.length > 0) {
        loadAllDetailedData(mostPlayed);
      }
    }
  }, [mostPlayedViewMode, activeTab, analyticsData.listeningHistory]);

  // Render track item with optional detailed view support
  const renderTrackItem = (track: any, showExtraInfo = false, showDetailedAnalytics = false) => {
    const isCurrentTrack = playbackState.currentTrack?.youtubeId === track.youtubeId;
    const isPlaying = isCurrentTrack && playbackState.isPlaying;
    const trackDetailedData = detailedData.get(track.id || track.youtubeId);
    const isLoadingDetailed = loadingDetailedData.has(track.id || track.youtubeId);
    
    return (
      <div key={track.id || track.youtubeId} className="bg-gray-800 rounded overflow-hidden">
        <div className="flex items-center gap-3 p-3 hover:bg-gray-700 transition-colors">
          {/* Play Button */}
          <Button
            onClick={() => onPlayTrack(track.youtubeId)}
            className="h-8 w-8 p-0 flex-shrink-0"
            variant={isPlaying ? "default" : "ghost"}
          >
            {isPlaying ? (
              <PauseIcon className="w-4 h-4" />
            ) : (
              <PlayIcon className="w-4 h-4" />
            )}
          </Button>
          
          {/* Track Info */}
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate text-sm">{track.title}</div>
            <div className="text-xs text-gray-400 truncate">{track.artist?.name || track.artist}</div>
            {showExtraInfo && track.analytics && (
              <div className="text-xs text-gray-500 mt-1">
                Score: {track.analytics.score.toFixed(2)} | 
                Plays: {track.analytics.listenCount} | 
                Completion: {(track.analytics.completionRate * 100).toFixed(0)}%
              </div>
            )}
            {track.playCount && (
              <div className="text-xs text-gray-500 mt-1">
                Played {track.playCount} times
              </div>
            )}
          </div>
          
          {/* Rating Display & Controls */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <span>{track.rating !== undefined ? track.rating : getTrackRating(track.id || '')}</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                onClick={() => track.id && onDecrementRating(track.id)}
                className="h-6 w-6 p-0"
                variant="ghost"
                size="sm"
              >
                <MinusIcon className="w-3 h-3" />
              </Button>
              <Button
                onClick={() => track.id && onIncrementRating(track.id)}
                className="h-6 w-6 p-0"
                variant="ghost"
                size="sm"
              >
                <PlusIcon className="w-3 h-3" />
              </Button>
            </div>
          </div>
          
          {/* Duration */}
          <div className="text-xs text-gray-400 font-mono flex-shrink-0 w-12 text-right">
            {track.duration ? formatTime(track.duration) : '--:--'}
          </div>
        </div>
        
        {/* Show Detailed Analytics Directly */}
        {showDetailedAnalytics && (
          <div className="border-t border-gray-700 bg-gray-850">
            {isLoadingDetailed ? (
              <div className="p-4 text-center text-gray-400">Loading detailed analytics...</div>
            ) : trackDetailedData ? (
              renderTrackDetailedAnalytics(trackDetailedData)
            ) : (
              <div className="p-4 text-center text-gray-400">No detailed data available</div>
            )}
          </div>
        )}
      </div>
    );
  };

  // Render detailed analytics for a track
  const renderTrackDetailedAnalytics = (data: any) => {
    const { track, statistics, sessions, mostPlayedSegments } = data;
    
    return (
      <div className="p-4 space-y-4">
        {/* Overall Statistics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div className="bg-gray-700 p-3 rounded">
            <div className="text-gray-400">Total Plays</div>
            <div className="text-xl font-bold">{statistics.totalPlays}</div>
          </div>
          <div className="bg-gray-700 p-3 rounded">
            <div className="text-gray-400">Total Time</div>
            <div className="text-xl font-bold">{formatTime(statistics.totalTimeListened)}</div>
          </div>
          <div className="bg-gray-700 p-3 rounded">
            <div className="text-gray-400">Completion Rate</div>
            <div className="text-xl font-bold">{(statistics.completionRate * 100).toFixed(0)}%</div>
          </div>
          <div className="bg-gray-700 p-3 rounded">
            <div className="text-gray-400">Avg. Listen Time</div>
            <div className="text-xl font-bold">{formatTime(statistics.averageListenTime)}</div>
          </div>
        </div>
        
        {/* Most Played Segments */}
        {mostPlayedSegments.length > 0 && (
          <div>
            <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
              <ChartBarIcon className="w-4 h-4" />
              Most Played Segments
            </h4>
            <div className="space-y-2">
              {mostPlayedSegments.slice(0, 3).map((segment: any, index: number) => (
                <div key={index} className="flex items-center gap-3 text-xs">
                  <div className="w-4 text-gray-400">#{index + 1}</div>
                  <div className="flex-1">
                    {formatTime(segment.startPosition)} - {formatTime(segment.endPosition)}
                  </div>
                  <div className="text-gray-400">
                    {segment.playCount} plays, {formatTime(segment.totalDuration)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Individual Sessions */}
        <div>
          <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
            <ListBulletIcon className="w-4 h-4" />
            Individual Play Sessions ({sessions.length})
          </h4>
          <div className="space-y-3">
            {sessions.map((session: any) => (
              <div key={session.id} className="bg-gray-700 p-3 rounded text-xs space-y-2">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <div className="font-medium">
                      {formatDate(session.createdAt)}
                    </div>
                    <div className="text-gray-400">
                      Listened: {session.completionMinSec.minutes}:{session.completionMinSec.seconds.toString().padStart(2, '0')} 
                      ({(session.completionPercentage * 100).toFixed(1)}%)
                    </div>
                    <div className="flex gap-2">
                      {session.completed && (
                        <span className="bg-green-600 text-white px-2 py-1 rounded text-xs">Completed</span>
                      )}
                      {session.skipped && (
                        <span className="bg-yellow-600 text-white px-2 py-1 rounded text-xs">Skipped</span>
                      )}
                      {!session.completed && !session.skipped && (
                        <span className="bg-gray-600 text-white px-2 py-1 rounded text-xs">Partial</span>
                      )}
                    </div>
                  </div>
                </div>
                
                {/* Timeline for this session */}
                {session.timelineSegments.length > 0 && (
                  <div>
                    <div className="text-gray-400 mb-1">Playback Timeline:</div>
                    <PlaybackTimeline 
                      segments={session.timelineSegments} 
                      trackDuration={track.duration || 0}
                      height={16}
                      className="w-full"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-400">Loading analytics...</div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Tab Navigation */}
      <div className="flex border-b border-gray-700 bg-gray-900">
        <Button
          onClick={() => setActiveTab('top')}
          variant={activeTab === 'top' ? 'default' : 'ghost'}
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500"
        >
          <ChartBarIcon className="w-4 h-4 mr-2" />
          Top Tracks
        </Button>
        <Button
          onClick={() => setActiveTab('recent')}
          variant={activeTab === 'recent' ? 'default' : 'ghost'}
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500"
        >
          <ClockIcon className="w-4 h-4 mr-2" />
          Recently Played
        </Button>
        <Button
          onClick={() => setActiveTab('history')}
          variant={activeTab === 'history' ? 'default' : 'ghost'}
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500"
        >
          <ClockIcon className="w-4 h-4 mr-2" />
          Full History
        </Button>
        <Button
          onClick={() => setActiveTab('rated')}
          variant={activeTab === 'rated' ? 'default' : 'ghost'}
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500"
        >
          <HeartIcon className="w-4 h-4 mr-2" />
          Rated Songs
        </Button>
        <Button
          onClick={() => setActiveTab('most-played')}
          variant={activeTab === 'most-played' ? 'default' : 'ghost'}
          className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500"
        >
          <ChartBarIcon className="w-4 h-4 mr-2" />
          Most Played
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'top' && (
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <ChartBarIcon className="w-5 h-5" />
              Top Tracks (AI Score)
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Ranked by AI score combining ratings, listen count, and completion rate
            </p>
            {analyticsData.topTracks.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No analytics data yet. Start listening to songs to see your top tracks!
              </div>
            ) : (
              <div className="space-y-2">
                {analyticsData.topTracks.map((track, index) => (
                  <div key={track.id} className="flex items-center gap-3">
                    <div className="w-8 text-center text-sm font-bold text-gray-400">
                      #{index + 1}
                    </div>
                    {renderTrackItem(track, true)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'recent' && (
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <ClockIcon className="w-5 h-5" />
              Recently Played
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Last 20 unique tracks you've listened to
            </p>
            {analyticsData.recentlyPlayed.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No recent listening history found.
              </div>
            ) : (
              <div className="space-y-2">
                {analyticsData.recentlyPlayed.map((session) => (
                  renderTrackItem(session.track)
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <ClockIcon className="w-5 h-5" />
              Full Listening History
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Complete history of all listening sessions with timestamps
            </p>
            {analyticsData.listeningHistory.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No listening history found.
              </div>
            ) : (
              <div className="space-y-2">
                {analyticsData.listeningHistory.map((session, index) => (
                  <div key={`${session.id}-${index}`} className="flex items-center gap-3 p-3 bg-gray-800 rounded">
                    <Button
                      onClick={() => onPlayTrack(session.track.youtubeId)}
                      className="h-8 w-8 p-0 flex-shrink-0"
                      variant="ghost"
                    >
                      <PlayIcon className="w-4 h-4" />
                    </Button>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium truncate text-sm">{session.track.title}</div>
                      <div className="text-xs text-gray-400 truncate">{session.track.artist?.name || session.track.artist}</div>
                      <div className="text-xs text-gray-500 mt-1">
                        {formatDate(session.createdAt)} | 
                        Listened: {formatTime(session.totalTime)} | 
                        {session.completed ? 'Completed' : session.skipped ? 'Skipped' : 'Partial'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'rated' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <HeartIcon className="w-5 h-5" />
                Rated Songs
              </h2>
              <div className="flex items-center gap-2">
                <FunnelIcon className="w-4 h-4 text-gray-400" />
                <select
                  value={ratedFilter}
                  onChange={(e) => setRatedFilter(e.target.value as any)}
                  className="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-sm"
                >
                  <option value="all">All Rated</option>
                  <option value="positive">Positive Only</option>
                  <option value="negative">Negative Only</option>
                </select>
              </div>
            </div>
            <p className="text-gray-400 text-sm mb-4">
              Songs you've rated using the +/- buttons, sorted by rating
            </p>
            {analyticsData.ratedTracks.length === 0 ? (
              <div className="text-center text-gray-400 py-8">
                No rated songs found. Use the +/- buttons to rate tracks!
              </div>
            ) : (
              <div className="space-y-2">
                {analyticsData.ratedTracks.map((ratingData) => {
                  const track = { ...ratingData.track, rating: ratingData.rating };
                  return renderTrackItem(track);
                })}
              </div>
            )}
          </div>
        )}

        {activeTab === 'most-played' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <ChartBarIcon className="w-5 h-5" />
                Most Played Songs
              </h2>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setMostPlayedViewMode('simple')}
                  variant={mostPlayedViewMode === 'simple' ? "default" : "ghost"}
                  className="h-8 px-3 text-sm"
                >
                  <ListBulletIcon className="w-4 h-4 mr-1" />
                  Simple
                </Button>
                <Button
                  onClick={() => setMostPlayedViewMode('detailed')}
                  variant={mostPlayedViewMode === 'detailed' ? "default" : "ghost"}
                  className="h-8 px-3 text-sm"
                >
                  <EyeIcon className="w-4 h-4 mr-1" />
                  Detailed
                </Button>
              </div>
            </div>
            
            <p className="text-gray-400 text-sm mb-4">
              {mostPlayedViewMode === 'simple' 
                ? "Songs ranked by total number of listening sessions"
                : "Detailed analytics for each song - click expand to see individual play sessions and timeline visualizations"
              }
            </p>
            
            {(() => {
              const mostPlayed = getMostPlayedTracks();
              return mostPlayed.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  No play count data yet. Start listening to see your most played songs!
                </div>
              ) : (
                <div className="space-y-2">
                  {mostPlayed.map((track, index) => (
                    <div key={track.id} className="flex items-start gap-3">
                      <div className="w-8 text-center text-sm font-bold text-gray-400 pt-3">
                        #{index + 1}
                      </div>
                      <div className="flex-1">
                        {renderTrackItem(track, false, mostPlayedViewMode === 'detailed')}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsDashboard;
