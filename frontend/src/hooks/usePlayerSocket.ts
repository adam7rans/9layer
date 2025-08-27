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

// More conservative connection parameters to prevent connection storms
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BASE_DELAY = 2000; // Start with 2 seconds
const MAX_RECONNECT_DELAY = 30000; // Max 30 seconds
const CONNECTION_TIMEOUT = 10000; // 10 second timeout
const CONNECTION_HEALTH_CHECK_INTERVAL = 15000; // 15 seconds
const CONNECTION_SERIALIZATION_KEY = '9layer_connection_attempt';

const usePlayerSocket = () => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [error, setError] = useState<Error | null>(null);
  const ws = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeout = useRef<NodeJS.Timeout | null>(null);
  const healthCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const lastHealthCheck = useRef<number>(Date.now());
  const eventHandlers = useRef<Set<EventHandler>>(new Set());
  const isMounted = useRef(true);
  const isManuallyClosed = useRef(false);
  const connectionId = useRef<string>(`conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
  const isConnecting = useRef(false); // Prevent overlapping connection attempts

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

  // Enhanced cleanup with comprehensive logging
  const cleanup = useCallback(() => {
    const connId = connectionId.current;
    console.log(`[WebSocket:${connId}] 🧹 Starting cleanup...`, {
      hasWebSocket: !!ws.current,
      readyState: ws.current?.readyState,
      readyStateText: ws.current ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.current.readyState] : 'NO_SOCKET',
      isMounted: isMounted.current,
      isConnecting: isConnecting.current
    });
    
    // Clear connection attempt flag
    isConnecting.current = false;
    
    if (ws.current) {
      const currentState = ws.current.readyState;
      console.log(`[WebSocket:${connId}] 🔌 Clearing event handlers and closing socket (state: ${['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][currentState]})`);
      
      ws.current.onopen = null;
      ws.current.onclose = null;
      ws.current.onerror = null;
      ws.current.onmessage = null;
      
      if (currentState === WebSocket.OPEN || currentState === WebSocket.CONNECTING) {
        console.log(`[WebSocket:${connId}] 🚪 Closing WebSocket connection`);
        ws.current.close(1000, 'Client cleanup');
      }
      
      ws.current = null;
    }

    if (reconnectTimeout.current) {
      console.log(`[WebSocket:${connId}] ⏰ Clearing reconnect timeout`);
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }
    
    if (healthCheckInterval.current) {
      console.log(`[WebSocket:${connId}] 💔 Clearing health check interval`);
      clearInterval(healthCheckInterval.current);
      healthCheckInterval.current = null;
    }
    
    // Remove connection serialization
    try {
      sessionStorage.removeItem(CONNECTION_SERIALIZATION_KEY);
    } catch (e) {
      console.warn(`[WebSocket:${connId}] ⚠️ Failed to clear connection serialization:`, e);
    }
    
    console.log(`[WebSocket:${connId}] ✅ Cleanup completed`);
  }, []);

  // Enhanced message handling with comprehensive logging
  const handleMessage = useCallback((event: MessageEvent) => {
    const connId = connectionId.current;
    try {
      // Update health check timestamp on any message received
      lastHealthCheck.current = Date.now();
      
      const data: WebSocketMessage = JSON.parse(event.data);
      console.log(`[WebSocket:${connId}] 📨 Raw message received:`, event.data);
      console.log(`[WebSocket:${connId}] 📄 Parsed message:`, data);
      console.log(`[WebSocket:${connId}] 🎯 Expected STATE_UPDATE event:`, WS_EVENTS.STATE_UPDATE);
      console.log(`[WebSocket:${connId}] ✅ Message type matches?`, data.type === WS_EVENTS.STATE_UPDATE);
      
      if (data.type === WS_EVENTS.STATE_UPDATE && data.data) {
        const update: PlayerStateUpdate = data.data;
        console.log(`[WebSocket:${connId}] 🔄 Processing state update:`, update);
        console.log(`[WebSocket:${connId}] 📞 Number of event handlers:`, eventHandlers.current.size);
        
        if (eventHandlers.current.size === 0) {
          console.warn(`[WebSocket:${connId}] ⚠️ No event handlers registered to process state update!`);
        }
        
        eventHandlers.current.forEach((handler, index) => {
          console.log(`[WebSocket:${connId}] 📁 Calling handler ${index + 1}/${eventHandlers.current.size}`);
          try {
            handler(update);
            console.log(`[WebSocket:${connId}] ✅ Handler ${index + 1} executed successfully`);
          } catch (handlerError) {
            console.error(`[WebSocket:${connId}] ❌ Handler ${index + 1} failed:`, handlerError);
          }
        });
      } else {
        console.log(`[WebSocket:${connId}] 🚫 Message ignored - not a state update or no data`);
      }
    } catch (err) {
      console.error(`[WebSocket:${connId}] ❌ Error processing message:`, err);
      console.error(`[WebSocket:${connId}] ❌ Raw event data:`, event);
    }
  }, []);

  // Enhanced error handling with comprehensive logging
  const handleError = useCallback((event: Event) => {
    const connId = connectionId.current;
    console.error(`[WebSocket:${connId}] ❌ Error event fired:`, event);
    console.error(`[WebSocket:${connId}] 📄 Error details:`, {
      type: event.type,
      target: event.target,
      currentTarget: event.currentTarget,
      timestamp: new Date().toISOString(),
      readyState: ws.current?.readyState,
      readyStateText: ws.current ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.current.readyState] : 'NO_SOCKET',
      reconnectAttempts: reconnectAttempts.current,
      isMounted: isMounted.current,
      isManuallyClosed: isManuallyClosed.current
    });
    
    const errorMsg = `WebSocket connection error (attempt ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})`;
    setError(new Error(errorMsg));
    setConnectionStatus('disconnected');
    isConnecting.current = false; // Clear connecting flag
    
    // Mark this connection attempt as failed
    try {
      sessionStorage.setItem(CONNECTION_SERIALIZATION_KEY, JSON.stringify({
        lastAttempt: Date.now(),
        failed: true,
        reason: 'error_event'
      }));
    } catch (e) {
      console.warn(`[WebSocket:${connId}] ⚠️ Failed to save error state:`, e);
    }
  }, []);

  // Enhanced close handling with connection serialization
  const handleClose = useCallback((event: CloseEvent) => {
    const connId = connectionId.current;
    console.log(`[WebSocket:${connId}] 🚪 Close event fired: ${event.code} ${event.reason}`);
    console.log(`[WebSocket:${connId}] 📄 Close details:`, {
      code: event.code,
      reason: event.reason,
      wasClean: event.wasClean,
      type: event.type,
      timestamp: new Date().toISOString(),
      reconnectAttempts: reconnectAttempts.current,
      isMounted: isMounted.current,
      isManuallyClosed: isManuallyClosed.current,
      isConnecting: isConnecting.current
    });
    
    setConnectionStatus('disconnected');
    isConnecting.current = false; // Clear connecting flag
    
    // Check if this was a manual close or component unmount
    if (!isMounted.current) {
      console.log(`[WebSocket:${connId}] 📴 Component unmounted - not reconnecting`);
      return;
    }
    
    if (isManuallyClosed.current) {
      console.log(`[WebSocket:${connId}] 🔌 Manually closed - not reconnecting`);
      return;
    }

    // Check for connection serialization to prevent rapid reconnections
    try {
      const lastAttemptData = sessionStorage.getItem(CONNECTION_SERIALIZATION_KEY);
      if (lastAttemptData) {
        const { lastAttempt } = JSON.parse(lastAttemptData);
        const timeSinceLastAttempt = Date.now() - lastAttempt;
        if (timeSinceLastAttempt < 1000) { // Less than 1 second ago
          console.warn(`[WebSocket:${connId}] ⚠️ Preventing connection storm - last attempt was ${timeSinceLastAttempt}ms ago`);
          return;
        }
      }
    } catch (e) {
      console.warn(`[WebSocket:${connId}] ⚠️ Failed to check connection serialization:`, e);
    }

    // Exponential backoff for reconnection
    const delay = Math.min(
      RECONNECT_BASE_DELAY * Math.pow(2, reconnectAttempts.current),
      MAX_RECONNECT_DELAY
    );

    if (reconnectAttempts.current < MAX_RECONNECT_ATTEMPTS) {
      reconnectAttempts.current += 1;
      console.log(`[WebSocket:${connId}] 🔄 Scheduling reconnection in ${delay}ms (attempt ${reconnectAttempts.current}/${MAX_RECONNECT_ATTEMPTS})`);
      
      // Save connection attempt to prevent overlaps
      try {
        sessionStorage.setItem(CONNECTION_SERIALIZATION_KEY, JSON.stringify({
          lastAttempt: Date.now(),
          connectionId: connId,
          attempt: reconnectAttempts.current
        }));
      } catch (e) {
        console.warn(`[WebSocket:${connId}] ⚠️ Failed to save connection attempt:`, e);
      }
      
      reconnectTimeout.current = setTimeout(() => {
        if (isMounted.current && !isManuallyClosed.current) {
          console.log(`[WebSocket:${connId}] ⏰ Executing scheduled reconnection`);
          connect();
        } else {
          console.log(`[WebSocket:${connId}] 🚫 Skipping scheduled reconnection - component state changed`);
        }
      }, delay);
    } else {
      console.error(`[WebSocket:${connId}] ❌ Max reconnection attempts reached`);
      setError(new Error('Failed to connect to the WebSocket server after maximum attempts'));
      
      // Save final failure state
      try {
        sessionStorage.setItem(CONNECTION_SERIALIZATION_KEY, JSON.stringify({
          lastAttempt: Date.now(),
          failed: true,
          reason: 'max_attempts_reached'
        }));
      } catch (e) {
        console.warn(`[WebSocket:${connId}] ⚠️ Failed to save failure state:`, e);
      }
    }
  }, []);

  // Enhanced connect function with connection serialization and comprehensive logging
  const connect = useCallback(() => {
    const connId = connectionId.current;
    console.log(`[WebSocket:${connId}] 🔌 connect() called, isMounted:`, isMounted.current);
    
    if (!isMounted.current) {
      console.log(`[WebSocket:${connId}] 📴 Component not mounted, aborting connect`);
      return;
    }

    // Check if already connecting to prevent overlapping attempts
    if (isConnecting.current) {
      console.log(`[WebSocket:${connId}] 🚫 Already connecting, skipping duplicate attempt`);
      return;
    }

    // Prevent duplicate connections
    if (ws.current?.readyState === WebSocket.CONNECTING || ws.current?.readyState === WebSocket.OPEN) {
      console.log(`[WebSocket:${connId}] 🚫 Connection already exists (state: ${['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.current.readyState]}), skipping`);
      return;
    }

    // Check connection serialization
    try {
      const lastAttemptData = sessionStorage.getItem(CONNECTION_SERIALIZATION_KEY);
      if (lastAttemptData) {
        const { lastAttempt, failed, reason } = JSON.parse(lastAttemptData);
        const timeSinceLastAttempt = Date.now() - lastAttempt;
        if (timeSinceLastAttempt < 500) { // Less than 500ms ago
          console.warn(`[WebSocket:${connId}] ⚠️ Preventing rapid reconnection - last attempt was ${timeSinceLastAttempt}ms ago`);
          return;
        }
        if (failed) {
          console.log(`[WebSocket:${connId}] 📝 Previous attempt failed (${reason}), clearing and retrying`);
        }
      }
    } catch (e) {
      console.warn(`[WebSocket:${connId}] ⚠️ Failed to check connection serialization:`, e);
    }

    console.log(`[WebSocket:${connId}] 🚀 Starting connection attempt...`);
    isConnecting.current = true;
    
    // Clean up any existing connection
    cleanup();
    setConnectionStatus('connecting');
    setError(null);

    try {
      const wsUrl = getWebSocketUrl();
      console.log(`[WebSocket:${connId}] 🌐 Creating WebSocket with URL:`, wsUrl);
      const socket = new WebSocket(wsUrl);
      ws.current = socket;
      
      console.log(`[WebSocket:${connId}] 🎯 WebSocket object created:`, {
        url: socket.url,
        protocol: socket.protocol,
        readyState: socket.readyState,
        readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][socket.readyState]
      });
      
      console.log(`[WebSocket:${connId}] 🔨 Setting up event handlers...`);

      // Enhanced onopen handler
      socket.onopen = () => {
        console.log(`[WebSocket:${connId}] 🎉 onopen event fired!`, {
          isMounted: isMounted.current,
          readyState: socket.readyState,
          timestamp: new Date().toISOString()
        });
        
        if (!isMounted.current) {
          console.log(`[WebSocket:${connId}] 📴 Component unmounted during connection, closing socket`);
          socket.close();
          return;
        }
        
        console.log(`[WebSocket:${connId}] ✅ Setting connection status to connected`);
        setConnectionStatus('connected');
        reconnectAttempts.current = 0;
        lastHealthCheck.current = Date.now();
        isConnecting.current = false;
        
        // Clear any failure state
        try {
          sessionStorage.removeItem(CONNECTION_SERIALIZATION_KEY);
        } catch (e) {
          console.warn(`[WebSocket:${connId}] ⚠️ Failed to clear connection state:`, e);
        }
        
        // Start health check interval (less aggressive)
        if (!healthCheckInterval.current) {
          console.log(`[WebSocket:${connId}] 💔 Starting health check interval (${CONNECTION_HEALTH_CHECK_INTERVAL}ms)`);
          healthCheckInterval.current = setInterval(() => {
            const now = Date.now();
            const timeSinceLastCheck = now - lastHealthCheck.current;
            
            if (timeSinceLastCheck > CONNECTION_HEALTH_CHECK_INTERVAL * 3) { // More lenient: 45 seconds
              console.warn(`[WebSocket:${connId}] ⚠️ Health check failed - no activity for ${timeSinceLastCheck}ms`);
              if (ws.current?.readyState === WebSocket.OPEN) {
                console.log(`[WebSocket:${connId}] 🔌 Triggering reconnection due to health check failure`);
                ws.current.close(1000, 'Health check timeout');
              }
            } else {
              console.log(`[WebSocket:${connId}] 💔 Health check OK - last activity ${timeSinceLastCheck}ms ago`);
            }
          }, CONNECTION_HEALTH_CHECK_INTERVAL);
        }
      };

      socket.onmessage = handleMessage;
      socket.onerror = handleError;
      socket.onclose = handleClose;
      
      console.log(`[WebSocket:${connId}] 📞 Event handlers attached, waiting for connection...`);
      
      // More conservative connection timeout
      const connectionTimeout = setTimeout(() => {
        if (socket.readyState === WebSocket.CONNECTING) {
          console.error(`[WebSocket:${connId}] ⏰ Connection timeout - still in CONNECTING state after ${CONNECTION_TIMEOUT}ms`);
          console.log(`[WebSocket:${connId}] 📄 Current socket state:`, {
            readyState: socket.readyState,
            readyStateText: ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][socket.readyState],
            url: socket.url,
            protocol: socket.protocol
          });
          
          socket.close(1008, 'Connection timeout');
          setConnectionStatus('disconnected');
          isConnecting.current = false;
          
          // Save timeout failure
          try {
            sessionStorage.setItem(CONNECTION_SERIALIZATION_KEY, JSON.stringify({
              lastAttempt: Date.now(),
              failed: true,
              reason: 'connection_timeout'
            }));
          } catch (e) {
            console.warn(`[WebSocket:${connId}] ⚠️ Failed to save timeout state:`, e);
          }
        }
      }, CONNECTION_TIMEOUT);
      
      // Clear timeout when connection opens
      const originalOnOpen = socket.onopen;
      socket.onopen = (...args) => {
        console.log(`[WebSocket:${connId}] ⏰ Clearing connection timeout`);
        clearTimeout(connectionTimeout);
        originalOnOpen?.(...args);
      };
      
      // Also clear timeout on close to prevent memory leaks
      const originalOnClose = socket.onclose;
      socket.onclose = (...args) => {
        console.log(`[WebSocket:${connId}] ⏰ Clearing connection timeout on close`);
        clearTimeout(connectionTimeout);
        isConnecting.current = false;
        originalOnClose?.(...args);
      };
      
    } catch (err) {
      console.error(`[WebSocket:${connId}] ❌ Connection creation error:`, err);
      setError(err as Error);
      setConnectionStatus('disconnected');
      isConnecting.current = false;
      
      // Save creation error
      try {
        sessionStorage.setItem(CONNECTION_SERIALIZATION_KEY, JSON.stringify({
          lastAttempt: Date.now(),
          failed: true,
          reason: 'creation_error'
        }));
      } catch (e) {
        console.warn(`[WebSocket:${connId}] ⚠️ Failed to save creation error:`, e);
      }
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

  // Enhanced send command with comprehensive logging
  const sendCommand = useCallback((type: string, data?: any) => {
    const connId = connectionId.current;
    console.log(`[WebSocket:${connId}] 📤 Attempting to send command:`, { type, data });
    console.log(`[WebSocket:${connId}] 🔌 Connection state:`, {
      readyState: ws.current?.readyState,
      readyStateText: ws.current ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.current.readyState] : 'NO_SOCKET',
      connectionStatus,
      isConnecting: isConnecting.current
    });
    
    if (ws.current?.readyState === WebSocket.OPEN) {
      try {
        const message: WebSocketMessage = { type, data };
        const messageString = JSON.stringify(message);
        console.log(`[WebSocket:${connId}] 📨 Sending message:`, messageString);
        
        ws.current.send(messageString);
        console.log(`[WebSocket:${connId}] ✅ Message sent successfully`);
        
        // Update health check on successful send
        lastHealthCheck.current = Date.now();
        return true;
      } catch (err) {
        console.error(`[WebSocket:${connId}] ❌ Error sending message:`, err);
        return false;
      }
    }
    
    console.warn(`[WebSocket:${connId}] ⚠️ Cannot send message - not connected. Ready state:`, {
      readyState: ws.current?.readyState,
      readyStateText: ws.current ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][ws.current.readyState] : 'NO_SOCKET',
      connectionStatus
    });
    
    // Only attempt reconnection if truly disconnected and not already trying
    if (connectionStatus === 'disconnected' && !isConnecting.current) {
      console.log(`[WebSocket:${connId}] 🔄 Triggering reconnection attempt from sendCommand`);
      connect();
    } else if (isConnecting.current) {
      console.log(`[WebSocket:${connId}] 🚫 Already connecting, not triggering another attempt`);
    }
    
    return false;
  }, [connectionStatus, connect]);

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

  // Enhanced connection lifecycle management
  useEffect(() => {
    const connId = connectionId.current;
    console.log(`[WebSocket:${connId}] 🔄 useEffect mounting - setting up connection`);
    isMounted.current = true;
    isManuallyClosed.current = false;
    
    // Clean up any existing connection first
    cleanup();
    
    // Single connection attempt on mount (no backup timer to prevent storms)
    console.log(`[WebSocket:${connId}] 🚀 Connecting on mount`);
    
    // Small delay to ensure DOM is ready and prevent rapid reconnections
    const mountTimer = setTimeout(() => {
      if (isMounted.current && !isManuallyClosed.current) {
        connect();
      }
    }, 500);

    return () => {
      console.log(`[WebSocket:${connId}] 📴 useEffect cleanup - component unmounting`);
      clearTimeout(mountTimer);
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
