import WebSocketService from '../../src/services/websocket.service';
import { TestDataFactory } from '../factory';
import { jest } from '@jest/globals';
import { WebSocketCommand, ExtendedWebSocket } from '../../src/types/websocket.types';

// Mock WebSocket and WebSocketServer
const mockSocket: ExtendedWebSocket = {
  send: jest.fn(),
  close: jest.fn(),
  terminate: jest.fn(),
  ping: jest.fn(),
  on: jest.fn(),
  readyState: 1, // WebSocket.OPEN
  clientId: 'test-client',
  isAlive: true,
  lastHeartbeat: new Date(),
};

const mockWebSocket: ExtendedWebSocket = {
  send: jest.fn(),
  close: jest.fn(),
  terminate: jest.fn(),
  ping: jest.fn(),
  on: jest.fn() as any,
  readyState: 1,
  clientId: 'test-client',
  isAlive: true,
  lastHeartbeat: new Date(),
};

const mockWebSocketServer = {
  on: jest.fn(),
  close: jest.fn(),
  clients: new Set([mockWebSocket]),
};



// Mock the WebSocket module
jest.mock('ws', () => ({
  WebSocket: {
    OPEN: 1,
    CLOSED: 3,
  },
  WebSocketServer: jest.fn().mockImplementation(() => mockWebSocketServer),
}));

describe('WebSocketService', () => {
  let websocketService: WebSocketService;
  let mockServer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    websocketService = new WebSocketService();
    mockServer = {
      on: jest.fn(),
      listen: jest.fn(),
    };
  });

  describe('Constructor', () => {
    it('should initialize with default values', () => {
      expect(websocketService).toBeDefined();
      expect(websocketService).toBeInstanceOf(WebSocketService);
    });
  });

  describe('initialize', () => {
    it('should initialize WebSocket server', () => {
      websocketService.initialize(mockServer);

      expect(mockServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });

    it('should handle WebSocket connections', () => {
      websocketService.initialize(mockServer);

      // Get the connection handler
      const connectionHandler = mockServer.on.mock.calls[0][1];

      // Mock connection
      const mockSocket = {
        send: jest.fn(),
        close: jest.fn(),
        terminate: jest.fn(),
        ping: jest.fn(),
        on: jest.fn(),
        readyState: 1,
      };

      const mockRequest = {
        headers: {
          'user-agent': 'test-agent',
        },
      };

      // Call connection handler
      connectionHandler(mockSocket, mockRequest);

      expect(mockSocket.clientId).toBeDefined();
      expect(mockSocket.isAlive).toBe(true);
      expect(mockSocket.lastHeartbeat).toBeInstanceOf(Date);
    });
  });

  describe('registerCommandHandler', () => {
    it('should register command handler', () => {
      const mockHandler = jest.fn<(command: WebSocketCommand, clientId: string) => Promise<void> | void>();

      websocketService.registerCommandHandler('test', mockHandler);

      // The handler should be stored internally
      expect(mockHandler).toBeDefined();
    });
  });

  describe('sendToClient', () => {
    it('should send message to specific client', () => {
      websocketService.initialize(mockServer);

      const mockMessage = TestDataFactory.createWebSocketMessage();
      const result = websocketService.sendToClient('test-client', mockMessage);

      expect(result).toBe(true);
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(mockMessage));
    });

    it('should return false for non-existent client', () => {
      const result = websocketService.sendToClient('non-existent', { type: 'test', payload: {}, timestamp: new Date() });

      expect(result).toBe(false);
    });

    it('should handle closed WebSocket connection', () => {
      // Mock closed connection
      const closedSocket = {
        ...mockWebSocket,
        readyState: 3, // WebSocket.CLOSED
        send: jest.fn(),
      };

      (websocketService as any).clients.set('closed-client', closedSocket);

      const result = websocketService.sendToClient('closed-client', { type: 'test', payload: {}, timestamp: new Date() });

      expect(result).toBe(false);
    });
  });

  describe('broadcast', () => {
    it('should broadcast message to all clients', () => {
      websocketService.initialize(mockServer);

      const mockMessage = TestDataFactory.createWebSocketMessage();
      const result = websocketService.broadcast(mockMessage);

      expect(result).toBeGreaterThan(0);
      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(mockMessage));
    });

    it('should exclude specific client', () => {
      websocketService.initialize(mockServer);

      const mockMessage = TestDataFactory.createWebSocketMessage();
      websocketService.broadcast(mockMessage, { excludeClientId: 'test-client' });

      // WebSocket.send should not be called since client is excluded
      expect(mockWebSocket.send).not.toHaveBeenCalled();
    });

    it('should broadcast to specific clients only', () => {
      websocketService.initialize(mockServer);

      const mockMessage = TestDataFactory.createWebSocketMessage();
      websocketService.broadcast(mockMessage, {
        includeOnlyClientIds: ['test-client']
      });

      expect(mockWebSocket.send).toHaveBeenCalledWith(JSON.stringify(mockMessage));
    });
  });

  describe('getClientInfo', () => {
    it('should return client information', () => {
      websocketService.initialize(mockServer);

      const clientInfo = websocketService.getClientInfo('test-client');

      expect(clientInfo).toBeDefined();
      expect(clientInfo?.id).toBe('test-client');
      expect(clientInfo?.connectedAt).toBeInstanceOf(Date);
    });

    it('should return null for non-existent client', () => {
      const clientInfo = websocketService.getClientInfo('non-existent');

      expect(clientInfo).toBeNull();
    });
  });

  describe('getConnectedClients', () => {
    it('should return list of connected client IDs', () => {
      websocketService.initialize(mockServer);

      const clients = websocketService.getConnectedClients();

      expect(clients).toContain('test-client');
      expect(Array.isArray(clients)).toBe(true);
    });
  });

  describe('disconnectClient', () => {
    it('should disconnect specific client', () => {
      websocketService.initialize(mockServer);

      websocketService.disconnectClient('test-client');

      expect(mockWebSocket.close).toHaveBeenCalled();
    });

    it('should handle non-existent client', () => {
      expect(() => {
        websocketService.disconnectClient('non-existent');
      }).not.toThrow();
    });
  });

  describe('disconnectAll', () => {
    it('should disconnect all clients', () => {
      websocketService.initialize(mockServer);

      websocketService.disconnectAll();

      expect(mockWebSocket.close).toHaveBeenCalled();
    });
  });

  describe('Message Handling', () => {
    it('should handle command messages', () => {
      websocketService.initialize(mockServer);
      const mockHandler = jest.fn<(command: WebSocketCommand, clientId: string) => Promise<void> | void>();

      websocketService.registerCommandHandler('testCommand', mockHandler);

      // Simulate message handling
      const message = TestDataFactory.createWebSocketMessage({
        type: 'command',
        payload: {
          action: 'testCommand',
          data: { test: 'value' },
        },
      });

      // Access private method through type assertion
      (websocketService as any).handleMessage('test-client', message);

      expect(mockHandler).toHaveBeenCalledWith(
        message.payload,
        'test-client'
      );
    });

    it('should handle unknown commands', () => {
      websocketService.initialize(mockServer);

      const message = TestDataFactory.createWebSocketMessage({
        type: 'command',
        payload: {
          action: 'unknownCommand',
        },
      });

      // Access private method through type assertion
      (websocketService as any).handleMessage('test-client', message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Unknown command')
      );
    });

    it('should handle command errors', () => {
      websocketService.initialize(mockServer);
      const mockHandler = jest.fn<(command: WebSocketCommand, clientId: string) => Promise<void> | void>().mockImplementation(() => Promise.reject(new Error('Command failed')));

      websocketService.registerCommandHandler('failingCommand', mockHandler);

      const message = TestDataFactory.createWebSocketMessage({
        type: 'command',
        payload: {
          action: 'failingCommand',
        },
      });

      // Access private method through type assertion
      (websocketService as any).handleMessage('test-client', message);

      expect(mockWebSocket.send).toHaveBeenCalledWith(
        expect.stringContaining('Command failed')
      );
    });
  });

  describe('Heartbeat Monitoring', () => {
    it('should start heartbeat monitoring', () => {
      websocketService.initialize(mockServer);

      // Access private method through type assertion
      (websocketService as any).startHeartbeat();

      expect((websocketService as any).heartbeatInterval).toBeDefined();
    });

    it('should stop heartbeat monitoring', () => {
      websocketService.initialize(mockServer);
      (websocketService as any).startHeartbeat();

      websocketService.stopHeartbeat();

      expect((websocketService as any).heartbeatInterval).toBeNull();
    });

    it('should handle pong responses', () => {
      websocketService.initialize(mockServer);

      const socket = (websocketService as any).clients.get('test-client');

      // Simulate pong event
      const pongHandler = socket.on.mock.calls.find(
        (call: any[]) => call[0] === 'pong'
      )[1];

      pongHandler();

      expect(socket.isAlive).toBe(true);
      expect(socket.lastHeartbeat).toBeInstanceOf(Date);
    });
  });

  describe('Connection Management', () => {
    it('should handle client disconnection', () => {
      websocketService.initialize(mockServer);

      // Access private method through type assertion
      (websocketService as any).handleDisconnection('test-client', 1000, Buffer.from('Normal closure'));

      expect((websocketService as any).clients.has('test-client')).toBe(false);
      expect((websocketService as any).clientInfo.has('test-client')).toBe(false);
    });

    it('should generate unique client IDs', () => {
      const id1 = (websocketService as any).generateClientId();
      const id2 = (websocketService as any).generateClientId();

      expect(id1).toMatch(/^ws_/);
      expect(id2).toMatch(/^ws_/);
      expect(id1).not.toBe(id2);
    });
  });

  describe('Statistics', () => {
    it('should return connection statistics', () => {
      websocketService.initialize(mockServer);

      const stats = websocketService.getConnectionStats();

      expect(stats).toHaveProperty('totalConnections');
      expect(stats).toHaveProperty('activeConnections');
      expect(stats).toHaveProperty('heartbeatStats');
      expect(typeof stats.totalConnections).toBe('number');
      expect(typeof stats.activeConnections).toBe('number');
    });
  });

  describe('Error Handling', () => {
    it('should handle WebSocket errors', () => {
      websocketService.initialize(mockServer);

      const socket = (websocketService as any).clients.get('test-client');

      // Simulate error event
      const errorHandler = socket.on.mock.calls.find(
        (call: any[]) => call[0] === 'error'
      )[1];

      const mockError = new Error('WebSocket error');
      errorHandler(mockError);

      expect(mockWebSocket.close).toHaveBeenCalled();
    });

    it('should handle invalid JSON messages', () => {
      websocketService.initialize(mockServer);

      // Access private method through type assertion
      expect(() => {
        (websocketService as any).parseMessage(Buffer.from('invalid json'));
      }).toThrow();
    });
  });

  describe('Shutdown', () => {
    it('should shutdown cleanly', () => {
      websocketService.initialize(mockServer);
      (websocketService as any).startHeartbeat();

      websocketService.shutdown();

      expect(mockWebSocketServer.close).toHaveBeenCalled();
      expect(mockWebSocket.close).toHaveBeenCalled();
      expect((websocketService as any).heartbeatInterval).toBeNull();
    });
  });
});
