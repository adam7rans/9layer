import * as WebSocket from 'ws';
import { IncomingMessage } from 'http';
import { EventEmitter } from 'events';
import {
  WebSocketMessage,
  WebSocketCommand,
  ClientInfo,
  ExtendedWebSocket,
  WebSocketServiceEvents,
  CommandHandlers,
  HeartbeatOptions,
  HeartbeatStats,
  BroadcastOptions
} from '../types/websocket.types';
import { env } from '../config/environment';

export class WebSocketService extends EventEmitter {
  private wss: WebSocket.Server | null = null;
  private clients: Map<string, ExtendedWebSocket> = new Map();
  private clientInfo: Map<string, ClientInfo> = new Map();
  private commandHandlers: CommandHandlers = {};
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private heartbeatOptions: HeartbeatOptions;
  private heartbeatStats: HeartbeatStats;

  constructor() {
    super();
    this.heartbeatOptions = {
      interval: env.WEBSOCKET_HEARTBEAT_INTERVAL,
      timeout: 30000, // 30 seconds
      maxMissed: 3,
    };
    this.heartbeatStats = {
      sent: 0,
      received: 0,
      missed: 0,
      timeoutCount: 0,
    };
    this.setupDefaultCommandHandlers();
  }

  /**
   * Initialize WebSocket server
   */
  initialize(server: any): void {
    this.wss = new WebSocket.Server({ server });

    this.wss.on('connection', (ws: ExtendedWebSocket, request: IncomingMessage) => {
      this.handleConnection(ws, request);
    });

    this.wss.on('error', (error) => {
      console.error('WebSocket Server Error:', error);
      this.emit('error', error);
    });

    // Start heartbeat monitoring
    this.startHeartbeat();

    console.log('WebSocket service initialized');
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: ExtendedWebSocket, request: IncomingMessage): void {
    const clientId = this.generateClientId();

    // Extend WebSocket with client ID and tracking properties
    ws.clientId = clientId;
    ws.isAlive = true;
    ws.lastHeartbeat = new Date(Date.now());

    // Create client info
    const clientInfo: ClientInfo = {
      id: clientId,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      userAgent: request.headers['user-agent'],
    };

    // Store client references
    this.clients.set(clientId, ws);
    this.clientInfo.set(clientId, clientInfo);

    // Setup event handlers
    this.setupWebSocketEventHandlers(ws, clientId);

    // Emit connection event
    const event: WebSocketServiceEvents['connection'] = {
      clientId,
      clientInfo,
    };
    this.emit('connection', event);

    console.log(`WebSocket client connected: ${clientId}`);

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'welcome',
      payload: {
        clientId,
        serverTime: new Date().toISOString(),
      },
      timestamp: new Date(),
    });
  }

  /**
   * Setup WebSocket event handlers for individual client
   */
  private setupWebSocketEventHandlers(ws: ExtendedWebSocket, clientId: string): void {
    ws.on('message', (data: WebSocket.RawData) => {
      try {
        const message = this.parseMessage(data);
        this.handleMessage(clientId, message);
      } catch (error) {
        console.error(`Error parsing message from ${clientId}:`, error);
        this.sendToClient(clientId, {
          type: 'error',
          payload: { message: 'Invalid message format' },
          timestamp: new Date(),
        });
      }
    });

    ws.on('close', (code: number, reason: Buffer) => {
      this.handleDisconnection(clientId, code, reason);
    });

    ws.on('error', (error) => {
      console.error(`WebSocket error for ${clientId}:`, error);
      this.handleDisconnection(clientId, 1006, Buffer.from('Connection error'));
    });

    ws.on('pong', () => {
      ws.isAlive = true;
      ws.lastHeartbeat = new Date(Date.now());
      this.heartbeatStats.received++;

      // Update client info
      const clientInfo = this.clientInfo.get(clientId);
      if (clientInfo) {
        clientInfo.lastHeartbeat = new Date();
      }
    });
  }

  /**
   * Handle incoming message from client
   */
  private async handleMessage(clientId: string, message: WebSocketMessage): Promise<void> {
    const event: WebSocketServiceEvents['message'] = {
      clientId,
      message,
    };
    this.emit('message', event);

    // Handle command messages
    if (message.type === 'command') {
      await this.handleCommand(clientId, message.payload as WebSocketCommand);
    }
  }

  /**
   * Handle WebSocket command
   */
  private async handleCommand(clientId: string, command: WebSocketCommand): Promise<void> {
    const handler = this.commandHandlers[command.action];
    if (handler) {
      try {
        await handler(command, clientId);
      } catch (error) {
        console.error(`Error handling command ${command.action}:`, error);
        this.sendToClient(clientId, {
          type: 'error',
          payload: {
            command: command.action,
            message: error instanceof Error ? error.message : 'Command failed',
          },
          timestamp: new Date(),
        });
      }
    } else {
      this.sendToClient(clientId, {
        type: 'error',
        payload: {
          command: command.action,
          message: 'Unknown command',
        },
        timestamp: new Date(),
      });
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(clientId: string, code: number, reason: Buffer): void {
    const reasonString = reason.toString();

    const event: WebSocketServiceEvents['disconnection'] = {
      clientId,
      reason: reasonString || `Code: ${code}`,
    };
    this.emit('disconnection', event);

    // Clean up client references
    this.clients.delete(clientId);
    this.clientInfo.delete(clientId);

    console.log(`WebSocket client disconnected: ${clientId} (${reasonString || code})`);
  }

  /**
   * Send message to specific client
   */
  sendToClient(clientId: string, message: WebSocketMessage): boolean {
    const ws = this.clients.get(clientId);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  /**
   * Broadcast message to all clients
   */
  broadcast(message: WebSocketMessage, options: BroadcastOptions = {}): number {
    const { excludeClientId, includeOnlyClientIds } = options;
    let sentCount = 0;

    for (const [clientId, ws] of Array.from(this.clients.entries())) {
      // Skip excluded client
      if (excludeClientId && clientId === excludeClientId) {
        continue;
      }

      // Skip if not in include list
      if (includeOnlyClientIds && !includeOnlyClientIds.includes(clientId)) {
        continue;
      }

      // Send message
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
        sentCount++;
      }
    }

    const event: WebSocketServiceEvents['broadcast'] = {
      message,
      recipientCount: sentCount,
    };
    this.emit('broadcast', event);

    return sentCount;
  }

  /**
   * Register command handler
   */
  registerCommandHandler(action: string, handler: CommandHandlers[string]): void {
    this.commandHandlers[action] = handler;
  }

  /**
   * Setup default command handlers
   */
  private setupDefaultCommandHandlers(): void {
    // Ping handler
    this.registerCommandHandler('ping', async (_command, clientId) => {
      this.sendToClient(clientId, {
        type: 'pong',
        payload: { timestamp: Date.now() },
        timestamp: new Date(),
      });
    });

    // Get status handler
    this.registerCommandHandler('getStatus', async (_command, clientId) => {
      this.sendToClient(clientId, {
        type: 'status',
        payload: {
          connectedClients: this.clients.size,
          uptime: process.uptime(),
          timestamp: Date.now(),
        },
        timestamp: new Date(),
      });
    });
  }

  /**
   * Start heartbeat monitoring
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      for (const ws of Array.from(this.clients.values())) {
        ws.isAlive = false;
        ws.ping();
        this.heartbeatStats.sent++;
      }
    }, this.heartbeatOptions.interval);
  }

  /**
   * Stop heartbeat monitoring
   */
  stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Get connection statistics
   */
  getConnectionStats(): {
    totalConnections: number;
    activeConnections: number;
    heartbeatStats: HeartbeatStats;
  } {
    return {
      totalConnections: this.clientInfo.size,
      activeConnections: this.clients.size,
      heartbeatStats: { ...this.heartbeatStats },
    };
  }

  /**
   * Get client information
   */
  getClientInfo(clientId: string): ClientInfo | null {
    return this.clientInfo.get(clientId) || null;
  }

  /**
   * Get all connected clients
   */
  getConnectedClients(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Disconnect client
   */
  disconnectClient(clientId: string, code: number = 1000, reason: string = 'Server disconnect'): void {
    const ws = this.clients.get(clientId);
    if (ws) {
      ws.close(code, reason);
    }
  }

  /**
   * Disconnect all clients
   */
  disconnectAll(code: number = 1000, reason: string = 'Server shutdown'): void {
    for (const ws of Array.from(this.clients.values())) {
      ws.close(code, reason);
    }
  }

  /**
   * Shutdown WebSocket service
   */
  shutdown(): void {
    this.stopHeartbeat();
    this.disconnectAll(1001, 'Server shutdown');

    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }

    console.log('WebSocket service shutdown');
  }

  // Private helper methods
  private generateClientId(): string {
    return `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private parseMessage(data: WebSocket.RawData): WebSocketMessage {
    const rawData = data.toString();
    return JSON.parse(rawData) as WebSocketMessage;
  }
}

// Export default instance
export default WebSocketService;
