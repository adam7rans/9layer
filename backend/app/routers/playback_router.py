import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import schemas
from ..database import get_db
from ..services.playback_service import playback_manager
from ..message_bus import command_queue

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/command")
async def command_endpoint(request: schemas.CommandRequest):
    logger.info(f"API: Command received: {request.command}")
    command = {"action": request.command}
    if request.track_id:
        command["track_id"] = request.track_id
    if request.value:
        command["value"] = request.value
    command_queue.put(command)
    return {"status": "command sent"}

@router.get("/current", response_model=schemas.PlaybackState)
async def get_current_playback_state():
    state = playback_manager.get_player_status()
    if not state:
        raise HTTPException(status_code=404, detail="No active playback session.")
    return state