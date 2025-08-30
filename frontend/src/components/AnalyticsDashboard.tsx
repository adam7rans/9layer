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
  FunnelIcon
} from '@heroicons/react/24/solid';
import { cn } from '@/lib/utils';

interface AnalyticsData {
  topTracks: any[];
  recentlyPlayed: any[];
  listeningHistory: any[];
}

interface AnalyticsDashboardProps {
  onPlayTrack: (trackId?: string) => void;
  onIncrementRating: (trackId: string) => void;
  onDecrementRating: (trackId: string) => void;
  getTrackRating: (trackId: string) => number;
  playbackState: any;
  tracks: Track[];
}

const AnalyticsDashboard = ({ 
  onPlayTrack, 
  onIncrementRating, 
  onDecrementRating, 
  getTrackRating,
  playbackState,
  tracks 
}: AnalyticsDashboardProps) => {
  const [analyticsData, setAnalyticsData] = useState<AnalyticsData>({
    topTracks: [],
    recentlyPlayed: [],
    listeningHistory: []
  });
  const [activeTab, setActiveTab] = useState<'top' | 'recent' | 'history' | 'rated' | 'most-played'>('top');
  const [loading, setLoading] = useState(true);
  const [ratedFilter, setRatedFilter] = useState<'all' | 'positive' | 'negative'>('all');

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
      const [topTracksRes, historyRes] = await Promise.all([
        api.analytics.getTopTracks('default', 50),
        api.analytics.getHistory('default', 100)
      ]);

      const newData: AnalyticsData = {
        topTracks: topTracksRes.success ? topTracksRes.data : [],
        recentlyPlayed: [],
        listeningHistory: historyRes.success ? historyRes.data : []
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
  }, []);

  useEffect(() => {
    loadAnalyticsData();
  }, [loadAnalyticsData]);

  // Filter tracks by rating
  const getFilteredRatedTracks = () => {
    const ratedTracks = tracks
      .map(track => ({
        ...track,
        rating: getTrackRating(track.id || '')
      }))
      .filter(track => {
        if (ratedFilter === 'positive') return track.rating > 0;
        if (ratedFilter === 'negative') return track.rating < 0;
        return track.rating !== 0; // 'all' shows any rated track
      })
      .sort((a, b) => b.rating - a.rating);

    return ratedTracks;
  };

  // Get most played tracks (from analytics data)
  const getMostPlayedTracks = () => {
    const trackPlayCounts = new Map();
    
    analyticsData.listeningHistory.forEach(session => {
      const trackId = session.track.id;
      trackPlayCounts.set(trackId, (trackPlayCounts.get(trackId) || 0) + 1);
    });

    return tracks
      .map(track => ({
        ...track,
        playCount: trackPlayCounts.get(track.id) || 0
      }))
      .filter(track => track.playCount > 0)
      .sort((a, b) => b.playCount - a.playCount)
      .slice(0, 50);
  };

  // Render track item
  const renderTrackItem = (track: any, showExtraInfo = false) => {
    const isCurrentTrack = playbackState.currentTrack?.youtubeId === track.youtubeId;
    const isPlaying = isCurrentTrack && playbackState.isPlaying;
    
    return (
      <div key={track.id || track.youtubeId} className="flex items-center gap-3 p-3 bg-gray-800 rounded hover:bg-gray-700 transition-colors">
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
            {(() => {
              const filteredTracks = getFilteredRatedTracks();
              return filteredTracks.length === 0 ? (
                <div className="text-center text-gray-400 py-8">
                  No rated songs found. Use the +/- buttons to rate tracks!
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredTracks.map((track) => renderTrackItem(track))}
                </div>
              );
            })()}
          </div>
        )}

        {activeTab === 'most-played' && (
          <div>
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
              <ChartBarIcon className="w-5 h-5" />
              Most Played Songs
            </h2>
            <p className="text-gray-400 text-sm mb-4">
              Songs ranked by total number of listening sessions
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
                    <div key={track.id} className="flex items-center gap-3">
                      <div className="w-8 text-center text-sm font-bold text-gray-400">
                        #{index + 1}
                      </div>
                      {renderTrackItem(track)}
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
