export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';

export interface TrackInfo {
  id: string;
  title: string;
  artist: string;
  album: string;
  artworkUrl?: string;
}

export interface PlayerState {
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  volume: number;
  currentTrack: TrackInfo | null;
}

export type PlayerStateUpdate = Partial<PlayerState>;

export type EventHandler = (update: PlayerStateUpdate) => void;

export interface WebSocketMessage {
  type: string;
  data?: any;
  error?: string;
}

// WebSocket event types
export const WS_EVENTS = {
  STATE_UPDATE: 'state_update',
  PLAY: 'play',
  PAUSE: 'pause',
  NEXT: 'next',
  PREVIOUS: 'previous',
  SEEK: 'seek',
  VOLUME: 'volume',
  ERROR: 'error',
} as const;
