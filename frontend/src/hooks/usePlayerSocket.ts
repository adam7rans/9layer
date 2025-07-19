'use client';

import { useCallback, useState, useRef, useEffect, useMemo } from 'react';
import { 
  ConnectionStatus, 
  PlayerStateUpdate, 
  EventHandler, 
  WebSocketMessage, 
  WS_EVENTS,
  PlayTrackCommand
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
      const wsUrl = 'ws://127.0.0.1:8000/api/ws';
      console.log('[WebSocket] Using URL:', wsUrl);
      return wsUrl;
    } catch (err) {
      console.error('[WebSocket] Error constructing URL:', err);
      throw err;
    }
  }, []);

  // Clean up WebSocket connection
  const cleanup = useCallback(() => {
    console.log('[WebSocket] Cleaning up...', {
      hasWebSocket: !!ws.current,
      readyState: ws.current?.readyState,
      isMounted: isMounted.current
    });
    
    if (ws.current) {
      ws.current.onopen = null;
      ws.current.onclose = null;
      ws.current.onerror = null;
      ws.current.onmessage = null;
      
      if (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING) {
        console.log('[WebSocket] Closing WebSocket connection');
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
      console.log('[WebSocket] Raw message received:', event.data);
      console.log('[WebSocket] Parsed message:', data);
      console.log('[WebSocket] Expected STATE_UPDATE event:', WS_EVENTS.STATE_UPDATE);
      console.log('[WebSocket] Message type matches?', data.type === WS_EVENTS.STATE_UPDATE);
      
      if (data.type === WS_EVENTS.STATE_UPDATE && data.data) {
        const update: PlayerStateUpdate = data.data;
        console.log('[WebSocket] Processing state update:', update);
        console.log('[WebSocket] Number of event handlers:', eventHandlers.current.size);
        
        eventHandlers.current.forEach((handler, index) => {
          console.log(`[WebSocket] Calling handler ${index + 1}/${eventHandlers.current.size}`);
          handler(update);
        });
      } else {
        console.log('[WebSocket] Message ignored - not a state update or no data');
      }
    } catch (err) {
      console.error('[WebSocket] Error processing message:', err);
    }
  }, []);

  // Handle WebSocket errors
  const handleError = useCallback((event: Event) => {
    console.error('[WebSocket] Error event fired:', event);
    console.error('[WebSocket] Error details:', {
      type: event.type,
      target: event.target,
      currentTarget: event.currentTarget
    });
    setError(new Error('WebSocket connection error'));
    setConnectionStatus('disconnected');
  }, []);

  // Handle WebSocket close
  const handleClose = useCallback((event: CloseEvent) => {
    console.log(`[WebSocket] Close event fired: ${event.code} ${event.reason}`);
    console.log('[WebSocket] Close details:', {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
      type: event.type
    });
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
    console.log('[WebSocket] connect() called, isMounted:', isMounted.current);
    if (!isMounted.current) {
      console.log('[WebSocket] Component not mounted, aborting connect');
      return;
    }

    console.log('[WebSocket] Starting connection attempt...');
    cleanup();
    setConnectionStatus('connecting');
    setError(null);

    try {
      const wsUrl = getWebSocketUrl();
      console.log('[WebSocket] Creating WebSocket with URL:', wsUrl);
      const socket = new WebSocket(wsUrl);
      ws.current = socket;
      console.log('[WebSocket] WebSocket object created:', socket);
      console.log('[WebSocket] Setting up event handlers...');

      socket.onopen = () => {
        console.log('[WebSocket] onopen event fired!', {
          isMounted: isMounted.current,
          readyState: socket.readyState
        });
        if (!isMounted.current) {
          console.log('[WebSocket] Component unmounted, closing socket');
          socket.close();
          return;
        }
        
        console.log('[WebSocket] Setting connection status to connected');
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
      };

      socket.onmessage = handleMessage;
      socket.onerror = handleError;
      socket.onclose = handleClose;
      
      console.log('[WebSocket] Event handlers attached, waiting for connection...');
      
      // Add a timeout to detect hanging connections
      const connectionTimeout = setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          console.error('[WebSocket] Connection timeout - still in CONNECTING state after 10 seconds');
          console.log('[WebSocket] Current socket state:', {
            readyState: socket.readyState,
            url: socket.url,
            protocol: socket.protocol
          });
          socket.close();
        }
      }, 10000); // 10 second timeout
      
      // Clear timeout when connection opens
      const originalOnOpen = socket.onopen;
      socket.onopen = (...args) => {
        clearTimeout(connectionTimeout);
        originalOnOpen?.(...args);
      };
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
    console.log('[WebSocket] Attempting to send command:', { type, data });
    console.log('[WebSocket] Connection state:', ws.current?.readyState);
    console.log('[WebSocket] WebSocket.OPEN constant:', WebSocket.OPEN);
    
    if (ws.current?.readyState === WebSocket.OPEN) {
      try {
        const message: WebSocketMessage = { type, data };
        const messageString = JSON.stringify(message);
        console.log('[WebSocket] Sending message:', messageString);
        
        ws.current.send(messageString);
        console.log('[WebSocket] Message sent successfully');
        return true;
      } catch (err) {
        console.error('[WebSocket] Error sending message:', err);
        return false;
      }
    }
    console.warn('[WebSocket] Cannot send message - not connected. Ready state:', ws.current?.readyState);
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
  const playTrack = useCallback((command: PlayTrackCommand) => 
    sendCommand(WS_EVENTS.PLAY_TRACK, command), 
  [sendCommand]);

  // Connect on mount and clean up on unmount
  useEffect(() => {
    console.log('[WebSocket] useEffect mounting - setting up connection');
    isMounted.current = true;
    isManuallyClosed.current = false;
    connect();

    return () => {
      console.log('[WebSocket] useEffect cleanup - component unmounting');
      isMounted.current = false;
      cleanup();
    };
  }, []); // Empty dependency array to run only once

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
    playTrack,
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
    playTrack,
  ]);
};

export default usePlayerSocket;
