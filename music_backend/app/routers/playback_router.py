from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app import schemas # Import your Pydantic schemas
from app.services import playback_manager # Import the singleton instance
from app.database import get_db
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["playback control"]
)

@router.post("/play", response_model=schemas.PlaybackActionResponse)
async def play_track_endpoint(
    request: schemas.PlayTrackRequest, 
    db: Session = Depends(get_db)
):
    logger.info(f"API: Play request for track_id: {request.track_id}")
    result = playback_manager.play_track(request.track_id, db)
    if result.get("status") == "error":
        raise HTTPException(status_code=404 if "not found" in result.get("message","").lower() else 500, detail=result.get("message"))
    return result

@router.post("/pause", response_model=schemas.PlaybackActionResponse)
async def pause_playback_endpoint():
    logger.info("API: Pause request")
    result = playback_manager.pause_playback()
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@router.post("/resume", response_model=schemas.PlaybackActionResponse)
async def resume_playback_endpoint():
    logger.info("API: Resume request")
    result = playback_manager.resume_playback()
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@router.post("/stop", response_model=schemas.PlaybackActionResponse)
async def stop_playback_endpoint():
    logger.info("API: Stop request")
    result = playback_manager.stop_playback()
    # Stop is generally not an error condition unless state is weird.
    return result

@router.post("/next", response_model=schemas.PlaybackActionResponse)
async def next_track_endpoint(db: Session = Depends(get_db)):
    logger.info("API: Next track request")
    result = playback_manager.play_next_track(db)
    if result.get("status") == "error":
        # Handle cases like "no tracks available" or "playback failed to start"
        raise HTTPException(status_code=400 if result.get("message") else 500, detail=result.get("message", "Error playing next track."))
    elif result.get("status") == "stopped" and "No tracks" in result.get("message", ""): # Special case for no more tracks
        return result # Return the "stopped" status
    return result


@router.post("/previous", response_model=schemas.PlaybackActionResponse)
async def previous_track_endpoint(db: Session = Depends(get_db)):
    logger.info("API: Previous track request")
    result = playback_manager.play_previous_track(db)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@router.post("/volume", response_model=schemas.PlaybackActionResponse)
async def set_volume_endpoint(request: schemas.VolumeRequest):
    logger.info(f"API: Set volume request to {request.level}")
    result = playback_manager.set_volume(request.level)
    return result

# Volume Up/Down can be alternatives or additions to direct volume set
@router.post("/volume/up", response_model=schemas.PlaybackActionResponse)
async def volume_up_endpoint():
    current_volume = playback_manager.volume_level
    new_volume = min(100, current_volume + 10)
    logger.info(f"API: Volume up request. Current: {current_volume}, New: {new_volume}")
    result = playback_manager.set_volume(new_volume)
    return result

@router.post("/volume/down", response_model=schemas.PlaybackActionResponse)
async def volume_down_endpoint():
    current_volume = playback_manager.volume_level
    new_volume = max(0, current_volume - 10)
    logger.info(f"API: Volume down request. Current: {current_volume}, New: {new_volume}")
    result = playback_manager.set_volume(new_volume)
    return result
    
@router.post("/mute", response_model=schemas.PlaybackActionResponse)
async def mute_toggle_endpoint():
    # PlaybackManager doesn't have a direct mute, this would be a conceptual toggle
    # For now, let's simulate by setting volume to 0 or restoring previous volume
    # This logic should ideally be in PlaybackManager if it needs to be smarter
    # For simplicity here, we just set to 0. A true mute toggle would need more state.
    logger.info("API: Mute toggle request (conceptual: sets volume to 0)")
    # This is a simplification. A real mute would remember last volume.
    # For now, just setting volume to 0.
    # playback_manager.toggle_mute() # if such a method existed
    result = playback_manager.set_volume(0) 
    result["message"] = "Conceptual mute: volume set to 0. A proper mute toggle would require more state."
    return result

@router.post("/skip_forward", response_model=schemas.PlaybackActionResponse)
async def skip_forward_endpoint(db: Session = Depends(get_db)):
    logger.info("API: Skip forward request")
    result = playback_manager.skip_logic(forward=True, db=db)
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@router.post("/skip_backward", response_model=schemas.PlaybackActionResponse)
async def skip_backward_endpoint(db: Session = Depends(get_db)): # db needed if skip causes next track
    logger.info("API: Skip backward request")
    result = playback_manager.skip_logic(forward=False, db=db) # Pass db here
    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))
    return result

@router.get("/player/status", response_model=schemas.PlaybackStatusResponse)
async def get_player_status_endpoint(db: Session = Depends(get_db)): # db is Optional for PlaybackManager.get_player_status
    logger.debug("API: Get player status request")
    # Pass db session to status if auto_play_next might trigger DB operations
    status_dict = playback_manager.get_player_status(db=db) 
    return status_dict
