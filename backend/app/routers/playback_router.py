@router.post("/command", response_model=schemas.PlaybackActionResponse)
async def command_endpoint(request: schemas.CommandRequest, db: Session = Depends(get_db)):
    logger.info(f"API: Command received: {request.command}")
    if request.command == "play":
        result = playback_manager.play_track(request.track_id, db)
    elif request.command == "pause":
        result = playback_manager.pause_playback()
    elif request.command == "resume":
        result = playback_manager.resume_playback()
    elif request.command == "stop":
        result = playback_manager.stop_playback()
    elif request.command == "next":
        result = playback_manager.play_next_track(db)
    elif request.command == "previous":
        result = playback_manager.play_previous_track(db)
    elif request.command == "volume":
        result = playback_manager.set_volume(request.value)
    elif request.command == "seek":
        result = playback_manager.seek_to(request.value)
    else:
        raise HTTPException(status_code=400, detail="Invalid command")

    if result.get("status") == "error":
        raise HTTPException(status_code=400, detail=result.get("message"))

    return result