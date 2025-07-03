import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from fastapi.middleware.cors import CORSMiddleware
from ..services.playback_service import playback_manager

logger = logging.getLogger(__name__)

router = APIRouter()

@router.websocket("")
async def websocket_endpoint(websocket: WebSocket):
    # Accept all WebSocket connections for development
    await websocket.accept()
    logger.info(f"WebSocket connection accepted from {websocket.client}")
        
    try:
        # Send initial message
        await websocket.send_json({"event": "hello", "data": "world"})
        
        while True:
            # Keep connection alive and wait for messages
            data = await websocket.receive_text()
            logger.debug(f"Received WebSocket message: {data}")
            
            # Echo the message back for testing
            await websocket.send_json({"event": "echo", "data": data})
            
    except WebSocketDisconnect as e:
        logger.info(f"WebSocket disconnected: {e}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        await websocket.close(code=status.WS_1011_INTERNAL_ERROR)
