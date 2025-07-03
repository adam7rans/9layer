'use client';

import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { 
  ConnectionStatus, 
  PlayerStateUpdate, 
  EventHandler, 
  WebSocketMessage, 
  WS_EVENTS 
} from '@/types/websocket';

const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 1000;
const MAX_RECONNECT_DELAY = 30000;

const usePlayerSocket = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<Error | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const eventHandlers = useRef<Set<EventHandler>>(new Set());
  const isMounted = useRef(true);
  const isManuallyClosed = useRef(false);

  // WebSocket URL - hardcoded for development
  const getWebSocketUrl = useCallback(() => {
    try {
      const wsUrl = 'ws://localhost:8000/api/ws';
      console.log('[WebSocket] Using URL:', wsUrl);
      return wsUrl;
    } catch (err) {
      console.error('[WebSocket] Error constructing URL:', err);
      throw err;
    }
  }, []);

  // Clean up WebSocket connection
  const cleanup = useCallback(() => {
    console.log('[WebSocket] Cleaning up...');
    if (ws.current) {
      ws.current.onopen = null;
      ws.current.onclose = null;
      ws.current.onerror = null;
      ws.current.onmessage = null;
      
      if (ws.current.readyState === WebSocket.OPEN) {
        ws.current.close();
      }
      
      ws.current = null;
    }

    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
  }, []);

  // Handle WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const data: WebSocketMessage = JSON.parse(event.data);
      console.log('[WebSocket] Message received:', data);
      
      if (data.type === WS_EVENTS.STATE_UPDATE && data.data) {
        const update: PlayerStateUpdate = data.data;
        eventHandlers.current.forEach(handler => handler(update));
      }
    } catch (err) {
      console.error('[WebSocket] Error processing message:', err);
    }
  }, []);

  // Handle WebSocket errors
  const handleError = useCallback((event: Event) => {
    console.error('[WebSocket] Error:', event);
    setError(new Error('WebSocket connection error'));
    setConnectionStatus('disconnected');
  }, []);

  // Handle WebSocket close
  const handleClose = useCallback((event: CloseEvent) => {
    console.log(`[WebSocket] Connection closed: ${event.code} ${event.reason}`);
    setConnectionStatus('disconnected');

    if (!isMounted.current || isManuallyClosed.current) {
      return;
    }

    // Exponential backoff for reconnection
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts.current),
      MAX_RECONNECT_DELAY
    );

    if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts.current += 1;
      console.log(`[WebSocket] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})`);
      
      reconnectTimeout.current = setTimeout(() => {
        if (isMounted.current) {
          connect();
        }
      }, delay);
    } else {
      console.error('[WebSocket] Max reconnection attempts reached');
      setError(new Error('Failed to connect to the WebSocket server'));
    }
  }, []);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!isMounted.current) return;

    cleanup();
    setConnectionStatus('connecting');
    setError(null);

    try {
      const socket = new WebSocket(getWebSocketUrl());
      ws.current = socket;

      socket.onopen = () => {
        if (!isMounted.current) {
          socket.close();
          return;
        }
        
        console.log('[WebSocket] Connected');
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
      };

      socket.onmessage = handleMessage;
      socket.onerror = handleError;
      socket.onclose = handleClose;
    } catch (err) {
      console.error('[WebSocket] Connection error:', err);
      setError(err as Error);
      setConnectionStatus('disconnected');
    }
  }, [cleanup, getWebSocketUrl, handleClose, handleError, handleMessage]);

  // Disconnect from WebSocket
  const disconnect = useCallback(() => {
    isManuallyClosed.current = true;
    cleanup();
    setConnectionStatus('disconnected');
  }, [cleanup]);

  // Reconnect to WebSocket
  const reconnect = useCallback(() => {
    reconnectAttempts.current = 0;
    isManuallyClosed.current = false;
    connect();
  }, [connect]);

  // Send command to WebSocket
  const sendCommand = useCallback((type: string, data?: any) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      try {
        const message: WebSocketMessage = { type, data };
        ws.current.send(JSON.stringify(message));
        return true;
      } catch (err) {
        console.error('[WebSocket] Error sending message:', err);
        return false;
      }
    }
    console.warn('[WebSocket] Cannot send message - not connected');
    return false;
  }, []);

  // Add event listener
  const addEventListener = useCallback((handler: EventHandler) => {
    eventHandlers.current.add(handler);
    return () => {
      eventHandlers.current.delete(handler);
    };
  }, []);

  // Player control methods
  const play = useCallback(() => sendCommand(WS_EVENTS.PLAY), [sendCommand]);
  const pause = useCallback(() => sendCommand(WS_EVENTS.PAUSE), [sendCommand]);
  const next = useCallback(() => sendCommand(WS_EVENTS.NEXT), [sendCommand]);
  const previous = useCallback(() => sendCommand(WS_EVENTS.PREVIOUS), [sendCommand]);
  const seek = useCallback((time: number) => sendCommand(WS_EVENTS.SEEK, { time }), [sendCommand]);
  const setVolume = useCallback((volume: number) => sendCommand(WS_EVENTS.VOLUME, { volume }), [sendCommand]);

  // Connect on mount and clean up on unmount
  useEffect(() => {
    isMounted.current = true;
    isManuallyClosed.current = false;
    connect();

    return () => {
      isMounted.current = false;
      cleanup();
    };
  }, [connect, cleanup]);

  // Return public API
  return useMemo(() => ({
    connectionStatus,
    error,
    connect,
    disconnect,
    reconnect,
    sendCommand,
    addEventListener,
    play,
    pause,
    next,
    previous,
    seek,
    setVolume,
  }), [
    connectionStatus,
    error,
    connect,
    disconnect,
    reconnect,
    sendCommand,
    addEventListener,
    play,
    pause,
    next,
    previous,
    seek,
    setVolume,
  ]);
};

export default usePlayerSocket;
