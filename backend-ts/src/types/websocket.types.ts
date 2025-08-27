import * as WebSocket from 'ws';
import { WebSocketMessage, WebSocketCommand, ClientInfo } from './api.types';

// Re-export types from api.types for convenience
export { WebSocketMessage, WebSocketCommand, ClientInfo } from './api.types';

// WebSocket Server Types
export interface WebSocketServerOptions {
  port?: number;
  heartbeatInterval?: number;
  maxConnections?: number;
}

export interface ExtendedWebSocket extends WebSocket {
  clientId?: string;
  isAlive?: boolean;
  lastHeartbeat?: Date;
}

// WebSocket Event Types
export interface WebSocketConnectionEvent {
  clientId: string;
  clientInfo: ClientInfo;
}

export interface WebSocketDisconnectionEvent {
  clientId: string;
  reason: string;
}

export interface WebSocketMessageEvent {
  clientId: string;
  message: WebSocketMessage;
}

// WebSocket Handler Types
export type WebSocketHandler = (
  ws: ExtendedWebSocket,
  message: WebSocketMessage,
  clients: Map<string, ExtendedWebSocket>
) => void;

export type WebSocketConnectionHandler = (
  ws: ExtendedWebSocket,
  request: any
) => void;

// Message Validators
export interface MessageValidator {
  validate(message: any): message is WebSocketMessage;
}

// Broadcast Options
export interface BroadcastOptions {
  excludeClientId?: string;
  includeOnlyClientIds?: string[];
}

// WebSocket Service Events
export interface WebSocketServiceEvents {
  connection: WebSocketConnectionEvent;
  disconnection: WebSocketDisconnectionEvent;
  message: WebSocketMessageEvent;
  error: { clientId: string; error: Error };
  broadcast: { message: WebSocketMessage; recipientCount: number };
}

// Command Handler Map
export interface CommandHandlers {
  [key: string]: (command: WebSocketCommand, clientId: string) => Promise<void> | void;
}

// Connection Pool Types
export interface ConnectionPoolStats {
  totalConnections: number;
  activeConnections: number;
  maxConnections: number;
  averageUptime: number;
}

// Heartbeat Types
export interface HeartbeatOptions {
  interval: number;
  timeout: number;
  maxMissed: number;
}

export interface HeartbeatStats {
  sent: number;
  received: number;
  missed: number;
  timeoutCount: number;
}
