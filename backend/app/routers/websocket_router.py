import logging
import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from ..services.playback_service import playback_manager
from ..message_bus import command_queue
from ..database import SessionLocal
from .. import models

logger = logging.getLogger(__name__)

router = APIRouter()

# Store connected WebSocket clients for broadcasting
connected_clients = set()

@router.websocket("")
async def websocket_endpoint(websocket: WebSocket):
    # Accept all WebSocket connections for development
    logger.info("DEBUG: About to accept WebSocket connection")
    await websocket.accept()
    logger.info(f"DEBUG: WebSocket connection accepted from {websocket.client}")
    
    # Add this client to connected clients
    connected_clients.add(websocket)
    logger.info("DEBUG: Added client to connected_clients")
        
    try:
        # Send initial message
        logger.info("DEBUG: About to send hello message")
        await websocket.send_json({"type": "hello", "data": "world"})
        logger.info("DEBUG: Hello message sent successfully")
        
        # Send initial player state (minimal version to avoid hanging)
        logger.info("DEBUG: About to send initial player state")
        try:
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
            logger.info("DEBUG: Initial player state sent successfully")
        except Exception as e:
            logger.error(f"DEBUG: Initial player state failed: {e}")
        
        while True:
            # Keep connection alive and wait for messages
            data = await websocket.receive_text()
            logger.debug(f"Received WebSocket message: {data}")
            
            # Process the message
            await process_websocket_message(websocket, data)
            
    except WebSocketDisconnect as e:
        logger.info(f"WebSocket disconnected: {e}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
    finally:
        # Remove client from connected clients
        connected_clients.discard(websocket)

async def process_websocket_message(websocket: WebSocket, data: str):
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
            await broadcast_player_state()
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

async def broadcast_player_state():
    """Broadcast current player state to all connected WebSocket clients"""
    if not connected_clients:
        return
        
    try:
        db = SessionLocal()
        try:
            state = playback_manager.get_player_status(db)
            if state:
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
                
                message = {
                    "type": "state_update",
                    "data": enhanced_state
                }
                
                # Send to all connected clients
                disconnected_clients = set()
                for client in connected_clients:
                    try:
                        await client.send_json(message)
                    except Exception as e:
                        logger.error(f"Error sending to client: {e}")
                        disconnected_clients.add(client)
                
                # Remove disconnected clients
                for client in disconnected_clients:
                    connected_clients.discard(client)
        finally:
            db.close()
                
    except Exception as e:
        logger.error(f"Error broadcasting player state: {e}")
