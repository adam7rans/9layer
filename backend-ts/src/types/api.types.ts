// Download Service Types
export interface DownloadOptions {
  url: string;
  format?: 'audio' | 'video';
  quality?: 'best' | 'good' | 'medium' | 'worst';
  outputDir?: string;
  filenameTemplate?: string;
  extractMetadata?: boolean;
  albumOverride?: string; // Force specific album name for playlist downloads
}

export interface DownloadResult {
  success: boolean;
  // Unique job identifier for tracking progress of this download
  jobId?: string;
  trackId?: string;
  filePath?: string;
  metadata?: TrackMetadata;
  error?: string;
  duration?: number;
}

export interface DownloadProgress {
  jobId: string;
  status: 'pending' | 'downloading' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  currentSpeed?: string;
  eta?: string;
  downloadedBytes?: number;
  totalBytes?: number;
}

export interface DownloadJob {
  id: string;
  url: string;
  options: DownloadOptions;
  status: DownloadProgress['status'];
  createdAt: Date;
  updatedAt: Date;
  // Optional metadata captured during processing for UI/monitoring
  title?: string;
  artist?: string;
  album?: string;
  youtubeId?: string;
  // Simple numeric progress (0-100). Detailed bytes can be added later.
  progress?: number;
}

export interface TrackMetadata {
  title: string;
  artist: string;
  album?: string;
  duration: number;
  youtubeId?: string;
  thumbnailUrl?: string;
  description?: string;
}

// Playback Service Types
export interface Track {
  id: string;
  title: string;
  artistId: string;
  albumId: string;
  duration: number;
  filePath: string;
  fileSize: number;
  youtubeId?: string | undefined;
  likeability: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PlaybackState {
  currentTrack: Track | null;
  isPlaying: boolean;
  position: number; // in seconds
  volume: number; // 0-100
  queue: Track[];
  repeat: 'none' | 'track' | 'queue';
  shuffle: boolean;
}

export interface PlaybackQueue {
  tracks: Track[];
  currentIndex: number;
}

// WebSocket Service Types
export interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: Date;
}

export interface ClientInfo {
  id: string;
  connectedAt: Date;
  lastHeartbeat: Date;
  userAgent?: string | undefined;
}

export interface WebSocketCommand {
  action: 'play' | 'pause' | 'next' | 'previous' | 'seek' | 'setVolume' | 'addToQueue' | 'removeFromQueue' | 'clearQueue';
  trackId?: string;
  position?: number;
  volume?: number;
  data?: any;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T = any> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface Artist {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface Album {
  id: string;
  title: string;
  artistId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileInfo {
  path: string;
  size: number;
  modified: Date;
  isDirectory: boolean;
}

// Event Types
export interface DownloadEvent {
  type: 'started' | 'progress' | 'completed' | 'failed' | 'album_completed';
  jobId: string;
  data: any;
}

export interface PlaybackEvent {
  type: 'started' | 'paused' | 'stopped' | 'next' | 'previous' | 'queueUpdated';
  data: any;
}

// Search Service Types
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

export interface SearchOptions {
  query?: string;
  limit?: number;
  offset?: number;
  artistLimit?: number;
  albumLimit?: number;
  trackLimit?: number;
}
