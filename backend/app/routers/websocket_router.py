import logging
import json
import asyncio
import time
import uuid
from datetime import datetime
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from ..services.playback_service import playback_manager
from ..message_bus import command_queue
from ..database import SessionLocal
from .. import models

logger = logging.getLogger(__name__)

router = APIRouter()

# Enhanced client tracking with connection metadata
connected_clients = {}
connection_stats = {
    'total_connections': 0,
    'active_connections': 0,
    'failed_connections': 0,
    'disconnect_reasons': {}
}

@router.websocket("")
async def websocket_endpoint(websocket: WebSocket):
    # Generate unique connection ID for tracking
    conn_id = str(uuid.uuid4())[:8]
    client_info = {
        'id': conn_id,
        'client': websocket.client,
        'connected_at': datetime.utcnow(),
        'last_message_at': datetime.utcnow(),
        'messages_received': 0,
        'messages_sent': 0,
        'errors': 0
    }
    
    logger.info(f"[WebSocket:{conn_id}] 🔌 Incoming connection attempt from {websocket.client}")
    
    try:
        # Accept the WebSocket connection
        connection_stats['total_connections'] += 1
        logger.info(f"[WebSocket:{conn_id}] 🚀 About to accept connection (total: {connection_stats['total_connections']})")
        
        start_time = time.time()
        await websocket.accept()
        accept_time = time.time() - start_time
        
        logger.info(f"[WebSocket:{conn_id}] ✅ Connection accepted in {accept_time:.3f}s")
        logger.info(f"[WebSocket:{conn_id}] 📄 Client details: host={websocket.client.host}, port={websocket.client.port}")
        logger.info(f"[WebSocket:{conn_id}] 📄 Headers: user-agent={websocket.headers.get('user-agent', 'unknown')}, origin={websocket.headers.get('origin', 'unknown')}")
        
        # Add this client to connected clients with metadata
        connected_clients[conn_id] = {
            'websocket': websocket,
            'info': client_info
        }
        connection_stats['active_connections'] += 1
        
        logger.info(f"[WebSocket:{conn_id}] 📋 Added to client registry (active: {connection_stats['active_connections']})")
        
        # Send hello message
        logger.info(f"[WebSocket:{conn_id}] 👋 Sending hello message")
        start_time = time.time()
        await websocket.send_json({"type": "hello", "data": "Connected successfully"})
        send_time = time.time() - start_time
        client_info['messages_sent'] += 1
        
        logger.info(f"[WebSocket:{conn_id}] ✅ Hello message sent in {send_time:.3f}s")
        
        # Send initial player state
        logger.info(f"[WebSocket:{conn_id}] 🎵 Sending initial player state")
        try:
            start_time = time.time()
            await websocket.send_json({
                "type": "state_update",
                "data": {
                    "currentTime": 0,
                    "duration": 0,
                    "isPlaying": False,
                    "currentTrack": None,
                    "volume": 1.0,
                    "audio_url": None
                }
            })
            send_time = time.time() - start_time
            client_info['messages_sent'] += 1
            
            logger.info(f"[WebSocket:{conn_id}] ✅ Initial state sent in {send_time:.3f}s")
        except Exception as e:
            client_info['errors'] += 1
            logger.error(f"[WebSocket:{conn_id}] ❌ Initial state send failed: {e}")
        
        logger.info(f"[WebSocket:{conn_id}] 🔁 Entering message loop...")
        
        # Main message loop
        while True:
            try:
                logger.debug(f"[WebSocket:{conn_id}] ⏳ Waiting for message...")
                
                # Receive message with timeout to detect hanging connections
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=60.0  # 60 second timeout
                )
                
                client_info['last_message_at'] = datetime.utcnow()
                client_info['messages_received'] += 1
                
                logger.info(f"[WebSocket:{conn_id}] 📨 Received message (#{client_info['messages_received']}): {data[:100]}{'...' if len(data) > 100 else ''}")
                
                # Process the message
                await process_websocket_message(websocket, data, conn_id)
                
            except asyncio.TimeoutError:
                logger.warning(f"[WebSocket:{conn_id}] ⏰ Message timeout - no activity for 60 seconds")
                # Send ping to check if connection is still alive
                try:
                    await websocket.send_json({"type": "ping", "data": {"timestamp": time.time()}})
                    logger.info(f"[WebSocket:{conn_id}] 🏓 Ping sent to check connection")
                except Exception as ping_error:
                    logger.error(f"[WebSocket:{conn_id}] ❌ Ping failed, connection is dead: {ping_error}")
                    break
                    
    except WebSocketDisconnect as e:
        disconnect_reason = f"WebSocketDisconnect: {e.code} - {e.reason if hasattr(e, 'reason') else 'unknown'}" 
        logger.info(f"[WebSocket:{conn_id}] 👋 Client disconnected: {disconnect_reason}")
        
        # Track disconnect reasons
        if disconnect_reason not in connection_stats['disconnect_reasons']:
            connection_stats['disconnect_reasons'][disconnect_reason] = 0
        connection_stats['disconnect_reasons'][disconnect_reason] += 1
        
    except Exception as e:
        client_info['errors'] += 1
        connection_stats['failed_connections'] += 1
        error_duration = (datetime.utcnow() - client_info['connected_at']).total_seconds()
        logger.error(f"[WebSocket:{conn_id}] ❌ Unexpected error: {type(e).__name__}: {e}")
        logger.error(f"[WebSocket:{conn_id}] 📄 Error details: type={type(e).__name__}, messages_rx={client_info['messages_received']}, messages_tx={client_info['messages_sent']}, duration={error_duration:.1f}s")
        
        try:
            await websocket.close(code=status.WS_1011_INTERNAL_ERROR, reason="Server error")
        except Exception as close_error:
            logger.error(f"[WebSocket:{conn_id}] ❌ Failed to close connection gracefully: {close_error}")
            
    finally:
        # Clean up connection tracking
        if conn_id in connected_clients:
            del connected_clients[conn_id]
            connection_stats['active_connections'] -= 1
            
        connection_duration = (datetime.utcnow() - client_info['connected_at']).total_seconds()
        
        logger.info(f"[WebSocket:{conn_id}] 🧹 Connection cleanup completed")
        logger.info(f"[WebSocket:{conn_id}] 📊 Final stats: duration={connection_duration:.1f}s, messages_rx={client_info['messages_received']}, messages_tx={client_info['messages_sent']}, errors={client_info['errors']}, active_remaining={connection_stats['active_connections']}")
        
        # Log overall connection statistics every 10 disconnections
        if connection_stats['total_connections'] % 10 == 0:
            logger.info(f"[WebSocket:STATS] 📊 Overall connection statistics: {json.dumps(connection_stats, indent=2)}")

async def process_websocket_message(websocket: WebSocket, data: str, conn_id: str):
    """Process incoming WebSocket messages and route commands to the playback system"""
    try:
        # Parse the JSON message
        message = json.loads(data)
        event_type = message.get("type")
        event_data = message.get("data", {})
        
        logger.info(f"Processing WebSocket event: {event_type} with data: {event_data}")
        
        # Map WebSocket events to backend commands
        command = None
        
        if event_type == "play_track":
            track_id = event_data.get("trackId")
            if track_id:
                command = {"action": "play", "track_id": track_id}
                logger.info(f"Play track command: {command}")
        
        elif event_type == "play":
            command = {"action": "resume"}
            
        elif event_type == "pause":
            command = {"action": "pause"}
            
        elif event_type == "next":
            command = {"action": "next"}
            
        elif event_type == "previous":
            command = {"action": "previous"}
            
        elif event_type == "seek":
            seek_time = event_data.get("time")
            if seek_time is not None:
                command = {"action": "seek", "value": seek_time}
                
        elif event_type == "set_volume":
            volume = event_data.get("volume")
            if volume is not None:
                command = {"action": "set_volume", "value": volume}
        
        # Send command to the playback system
        if command:
            logger.info(f"Sending command to queue: {command}")
            command_queue.put(command)
            
            # Send confirmation back to client
            await websocket.send_json({
                "type": "command_received", 
                "data": {"command": event_type, "status": "processed"}
            })
            
            # Wait a moment for the command to be processed, then send updated state
            await asyncio.sleep(0.1)
            await broadcast_player_state(conn_id)
        else:
            logger.warning(f"Unknown or invalid WebSocket event: {event_type}")
            await websocket.send_json({
                "type": "error", 
                "data": {"message": f"Unknown event type: {event_type}"}
            })
            
    except json.JSONDecodeError as e:
        logger.error(f"Invalid JSON in WebSocket message: {e}")
        await websocket.send_json({
            "type": "error", 
            "data": {"message": "Invalid JSON format"}
        })
    except Exception as e:
        logger.error(f"Error processing WebSocket message: {e}")
        await websocket.send_json({
            "type": "error", 
            "data": {"message": f"Processing error: {str(e)}"}
        })

async def send_player_state(websocket: WebSocket):
    """Send current player state to a specific WebSocket client"""
    try:
        db = SessionLocal()
        try:
            state = playback_manager.get_player_status(db)
            
            # Enhance state with track information from database
            current_track = None
            if state.get('track_id'):
                track = db.query(models.Track).filter(models.Track.id == state['track_id']).first()
                if track:
                    current_track = {
                        "id": track.id,
                        "title": track.title,
                        "artist": track.artist,
                        "album": track.album.title if track.album else "Unknown Album",
                        "artworkUrl": track.artwork_url
                    }

            enhanced_state = {
                "currentTime": state.get('elapsed_time', 0),
                "duration": state.get('duration', 0),
                "isPlaying": state.get('is_playing', False),
                "currentTrack": current_track,
                "volume": state.get('volume', 70) / 100.0,  # Convert to 0-1 range
                "audio_url": state.get('audio_url')
            }
            
            await websocket.send_json({
                "type": "state_update",
                "data": enhanced_state
            })
            logger.info("Player state sent successfully")
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error sending player state: {e}")
        # Send fallback state
        await websocket.send_json({
            "type": "state_update",
            "data": {
                "currentTime": 0,
                "duration": 0,
                "isPlaying": False,
                "currentTrack": None,
                "volume": 1.0,
                "audio_url": None
            }
        })

async def broadcast_player_state(source_conn_id: str = "system"):
    """Enhanced player state broadcaster with comprehensive logging"""
    start_time = time.time()
    
    if not connected_clients:
        logger.debug(f"[WebSocket:{source_conn_id}] 📡 No clients connected for broadcast")
        return
    
    client_count = len(connected_clients)
    logger.info(f"[WebSocket:{source_conn_id}] 📡 Broadcasting player state to {client_count} clients...")
        
    try:
        db = SessionLocal()
        try:
            db_start = time.time()
            state = playback_manager.get_player_status(db)
            db_time = time.time() - db_start
            
            logger.debug(f"[WebSocket:{source_conn_id}] 📄 State fetched from backend in {db_time:.3f}s")
            
            if state:
                # Enhance state with track information from database
                current_track = None
                if state.get('track_id'):
                    track_start = time.time()
                    track = db.query(models.Track).filter(models.Track.id == state['track_id']).first()
                    track_time = time.time() - track_start
                    
                    if track:
                        current_track = {
                            "id": track.id,
                            "title": track.title,
                            "artist": track.artist,
                            "album": track.album.title if track.album else "Unknown Album",
                            "artworkUrl": track.artwork_url
                        }
                        logger.debug(f"[WebSocket:{source_conn_id}] 🎵 Track loaded in {track_time:.3f}s: {track.title}")

                enhanced_state = {
                    "currentTime": state.get('elapsed_time', 0),
                    "duration": state.get('duration', 0),
                    "isPlaying": state.get('is_playing', False),
                    "currentTrack": current_track,
                    "volume": state.get('volume', 70) / 100.0,  # Convert to 0-1 range
                    "audio_url": state.get('audio_url')
                }
                
                message = {
                    "type": "state_update",
                    "data": enhanced_state
                }
                
                logger.debug(f"[WebSocket:{source_conn_id}] 📄 Broadcasting: {json.dumps(enhanced_state, default=str)[:150]}...")
                
                # Send to all connected clients with individual tracking
                disconnected_clients = []
                successful_sends = 0
                failed_sends = 0
                
                broadcast_start = time.time()
                
                for conn_id, client_data in connected_clients.items():
                    client_websocket = client_data['websocket']
                    client_info = client_data['info']
                    
                    try:
                        send_start = time.time()
                        await client_websocket.send_json(message)
                        send_time = time.time() - send_start
                        
                        client_info['messages_sent'] += 1
                        client_info['last_message_at'] = datetime.utcnow()
                        successful_sends += 1
                        
                        logger.debug(f"[WebSocket:{source_conn_id}] ✅ Sent to {conn_id} in {send_time:.3f}s")
                        
                    except Exception as e:
                        failed_sends += 1
                        client_info['errors'] += 1
                        logger.error(f"[WebSocket:{source_conn_id}] ❌ Failed to send to {conn_id}: {type(e).__name__}: {e}")
                        disconnected_clients.append(conn_id)
                
                broadcast_time = time.time() - broadcast_start
                
                # Remove disconnected clients
                for conn_id in disconnected_clients:
                    if conn_id in connected_clients:
                        del connected_clients[conn_id]
                        connection_stats['active_connections'] -= 1
                        logger.warning(f"[WebSocket:{source_conn_id}] 🚪 Removed disconnected client {conn_id}")
                
                total_time = time.time() - start_time
                logger.info(f"[WebSocket:{source_conn_id}] ✅ Broadcast completed in {total_time:.3f}s (send: {broadcast_time:.3f}s)")
                logger.info(f"[WebSocket:{source_conn_id}] 📊 Results: {successful_sends} successful, {failed_sends} failed, {len(disconnected_clients)} disconnected")
            
            else:
                logger.warning(f"[WebSocket:{source_conn_id}] ⚠️ No player state available for broadcast")
                
        finally:
            db.close()
                
    except Exception as e:
        logger.error(f"[WebSocket:{source_conn_id}] ❌ Error during broadcast: {type(e).__name__}: {e}")
        broadcast_time = time.time() - start_time
        logger.error(f"[WebSocket:{source_conn_id}] 📄 Broadcast context: client_count={len(connected_clients)}, processing_time={broadcast_time:.3f}s")
