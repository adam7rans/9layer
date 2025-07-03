import logging
import threading
import time
from .message_bus import command_queue
from .services.playback_service import playback_manager
from .database import SessionLocal

logger = logging.getLogger(__name__)

def playback_worker():
    logger.info("Playback worker thread started")
    while True:
        try:
            command = command_queue.get()
            logger.info(f"Worker received command: {command}")
            db = SessionLocal()
            try:
                if command['action'] == 'play':
                    playback_manager.play_track(command['track_id'], db)
                elif command['action'] == 'pause':
                    playback_manager.pause_playback()
                elif command['action'] == 'resume':
                    playback_manager.resume_playback()
                elif command['action'] == 'stop':
                    playback_manager.stop_playback()
                elif command['action'] == 'next':
                    playback_manager.play_next_track(db)
                elif command['action'] == 'previous':
                    playback_manager.play_previous_track(db)
                elif command['action'] == 'volume':
                    playback_manager.set_volume(command['value'])
                elif command['action'] == 'seek':
                    playback_manager.seek_to(command['value'])
            finally:
                db.close()
            command_queue.task_done()
        except Exception as e:
            logger.error(f"Error in playback worker: {e}", exc_info=True)
