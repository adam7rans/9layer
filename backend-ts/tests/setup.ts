// Test setup file
import { jest } from '@jest/globals';

// Set up test environment
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';

// Mock external dependencies
jest.mock('youtube-dl-exec', () => ({
  default: jest.fn(),
}));

jest.mock('fluent-ffmpeg', () => {
  return jest.fn().mockImplementation(() => ({
    input: jest.fn().mockReturnThis(),
    output: jest.fn().mockReturnThis(),
    on: jest.fn().mockReturnThis(),
    run: jest.fn().mockReturnThis(),
  }));
});

jest.mock('ws', () => ({
  WebSocket: jest.fn(),
  WebSocketServer: jest.fn(),
}));

// Global test utilities
declare global {
  var testUtils: {
    wait: (ms: number) => Promise<void>;
    createMockRequest: (body?: any, params?: any, query?: any) => any;
    createMockReply: () => any;
  };
}

global.testUtils = {
  // Helper to wait for async operations
  wait: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

  // Helper to create mock request/response objects
  createMockRequest: (body?: any, params?: any, query?: any) => ({
    body,
    params,
    query,
  }),

  createMockReply: () => ({
    send: jest.fn().mockReturnThis(),
    code: jest.fn().mockReturnThis(),
  }),
};
