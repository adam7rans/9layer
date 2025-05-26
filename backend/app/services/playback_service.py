import subprocess
import time
import collections
import logging
import os
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from .. import models # For querying track paths
from ..config import MUSIC_DOWNLOAD_DIR # To locate files if paths are relative
from pathlib import Path # ensure Path is imported

logger = logging.getLogger(__name__)

PLAYER_CMD = os.getenv("MPG123_PATH", "mpg123") # Allow overriding mpg123 path

class PlaybackManager:
    def __init__(self, history_limit=50):
        self.current_track_id: Optional[str] = None
        self.current_track_path: Optional[str] = None
        self.current_track_duration: int = 0
        self.playback_process: Optional[subprocess.Popen] = None
        self.is_playing: bool = False
        self.is_paused: bool = False # True if deliberately paused
        self.volume_level: int = 70 # Default volume
        self.play_history: collections.deque[str] = collections.deque(maxlen=history_limit)
        self.song_start_time_monotonic: float = 0.0 # time.monotonic() when song started/resumed
        self.paused_at_elapsed_time: float = 0.0 # Accumulated elapsed time when paused

        self.random_mode: bool = False # Not implemented in this subtask, placeholder
        self.auto_play_next: bool = True # Not fully implemented in this subtask, placeholder for logic

    def _get_song_duration(self, file_path: str) -> int:
        try:
            cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration",
                   "-of", "default=noprint_wrappers=1:nokey=1", file_path]
            process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            duration_str, err = process.communicate(timeout=10) # Added timeout
            if process.returncode != 0:
                logger.error(f"ffprobe error getting duration for {file_path}: {err}")
                return 0
            return int(float(duration_str.strip()))
        except subprocess.CalledProcessError as e: # This might not be hit due to Popen
            logger.error(f"ffprobe CalledProcessError for {file_path}: {e.stderr}")
            return 0
        except FileNotFoundError:
            logger.error("ffprobe command not found. Please ensure it's installed and in PATH.")
            return 0
        except ValueError: # Handles if float(duration_str.strip()) fails
            logger.error(f"Could not parse duration from ffprobe output: '{duration_str}' for {file_path}")
            return 0
        except subprocess.TimeoutExpired:
            logger.error(f"ffprobe timed out for {file_path}")
            if process: process.kill()
            return 0
        except Exception as e: # Catch any other unexpected error
            logger.error(f"Unexpected error in _get_song_duration for {file_path}: {e}")
            return 0


    def _seconds_to_frames(self, seconds: float, typical_frames_per_sec: float = 38.28) -> int:
        # This is a rough estimate for MP3s. mpg123's handling of seeking can vary.
        return int(seconds * typical_frames_per_sec)

    def _start_playback(self, track_path: str, start_offset_sec: float = 0.0):
        if self.playback_process:
            self.playback_process.terminate()
            try:
                self.playback_process.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                self.playback_process.kill()
            self.playback_process = None

        cmd = [PLAYER_CMD, "-q"] # Quiet mode
        
        if start_offset_sec > 0:
            frames_to_skip = self._seconds_to_frames(start_offset_sec)
            if frames_to_skip > 0:
                cmd.extend(["-k", str(frames_to_skip)])
        
        cmd.append(track_path)

        try:
            self.playback_process = subprocess.Popen(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
            self.is_playing = True
            self.is_paused = False
            self.song_start_time_monotonic = time.monotonic()
            logger.info(f"Playback started: {track_path} at offset {start_offset_sec}s. PID: {self.playback_process.pid}")
        except FileNotFoundError:
            logger.error(f"PLAYER_CMD '{PLAYER_CMD}' not found. Playback failed for {track_path}.")
            self.is_playing = False # Ensure state reflects failure
        except Exception as e:
            logger.error(f"Failed to start playback process for {track_path}: {e}")
            self.is_playing = False # Ensure state reflects failure
    
    def _resolve_track_path(self, track_id: str, db: Session) -> Optional[str]:
        db_track = db.query(models.Track).filter(models.Track.id == track_id).first()
        if not db_track or not db_track.file_path:
            logger.error(f"Track ID {track_id} not found in DB or has no file_path.")
            return None
        
        track_file_path = Path(db_track.file_path)
        
        # Check if path stored is absolute. If not, prepend MUSIC_DOWNLOAD_DIR
        # This logic assumes that download_service might store relative paths.
        # It's generally better if download_service stores absolute paths.
        if not track_file_path.is_absolute():
            logger.warning(f"Track path '{db_track.file_path}' for ID {track_id} is relative. Resolving against MUSIC_DOWNLOAD_DIR.")
            track_file_path = MUSIC_DOWNLOAD_DIR / track_file_path
            # It's good to normalize after construction (e.g. resolve ".." components)
            track_file_path = track_file_path.resolve()


        if not track_file_path.exists():
            logger.error(f"Track file not found at resolved path: {track_file_path} for ID {track_id}")
            return None
        return str(track_file_path)


    def play_track(self, track_id: str, db: Session) -> Dict[str, Any]:
        track_path = self._resolve_track_path(track_id, db)
        if not track_path:
            self.current_track_id = None # Clear current track info on failure
            self.current_track_path = None
            self.current_track_duration = 0
            return {"status": "error", "message": f"Track {track_id} not found or path invalid."}

        self.current_track_id = track_id
        self.current_track_path = track_path
        self.current_track_duration = self._get_song_duration(track_path)
        self.paused_at_elapsed_time = 0.0 

        if not self.play_history or self.play_history[-1] != track_id:
             self.play_history.append(track_id)

        self._start_playback(track_path, start_offset_sec=0.0)
        if self.is_playing:
            return {"status": "playing", "track_id": track_id, "duration": self.current_track_duration}
        else:
            # If _start_playback failed, is_playing will be False.
            # Reset track info as playback didn't actually start for this track.
            self.current_track_id = None 
            self.current_track_path = None
            self.current_track_duration = 0
            return {"status": "error", "message": f"Playback failed to start for track {track_id}."}


    def pause_playback(self) -> Dict[str, Any]:
        if not self.is_playing or not self.playback_process:
            return {"status": "error", "message": "Not currently playing."}

        current_elapsed_segment = time.monotonic() - self.song_start_time_monotonic
        self.paused_at_elapsed_time += current_elapsed_segment
        
        self.playback_process.terminate() 
        try:
            self.playback_process.wait(timeout=0.5)
        except subprocess.TimeoutExpired:
            self.playback_process.kill()
        self.playback_process = None
        
        self.is_playing = False
        self.is_paused = True
        logger.info(f"Playback paused for track {self.current_track_id} at {self.paused_at_elapsed_time:.2f}s")
        return {"status": "paused", "track_id": self.current_track_id, "elapsed_time": self.paused_at_elapsed_time}

    def resume_playback(self) -> Dict[str, Any]:
        if not self.is_paused or not self.current_track_path:
            return {"status": "error", "message": "Not currently paused or no track to resume."}

        logger.info(f"Resuming track {self.current_track_id} from {self.paused_at_elapsed_time:.2f}s")
        self._start_playback(self.current_track_path, start_offset_sec=self.paused_at_elapsed_time)
        
        if self.is_playing:
            return {"status": "resumed", "track_id": self.current_track_id}
        else:
            self.is_paused = True 
            return {"status": "error", "message": "Failed to resume playback."}

    def stop_playback(self) -> Dict[str, Any]:
        original_track_id = self.current_track_id # Preserve for the return message
        if self.playback_process:
            self.playback_process.terminate()
            try:
                self.playback_process.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                self.playback_process.kill()
            self.playback_process = None
        
        logger.info(f"Playback stopped for track {self.current_track_id}")
        self.is_playing = False
        self.is_paused = False
        # Keep current_track_id, path, duration for status until a new track is played or explicitly cleared.
        # self.current_track_id = None 
        # self.current_track_path = None
        # self.current_track_duration = 0
        self.song_start_time_monotonic = 0.0 # Reset start time
        self.paused_at_elapsed_time = 0.0 # Reset accumulated pause time
        return {"status": "stopped", "track_id": original_track_id}

    def get_current_elapsed_time(self) -> float:
        if not self.current_track_id:
            return 0.0
        if self.is_playing:
            return (time.monotonic() - self.song_start_time_monotonic) + self.paused_at_elapsed_time
        else: 
            return self.paused_at_elapsed_time


    def skip_logic(self, forward: bool, db: Session) -> Dict[str, Any]:
        if not self.current_track_id or not self.current_track_path:
            return {"status": "error", "message": "No track currently loaded to skip."}

        skip_amount_sec = 15.0
        current_elapsed = self.get_current_elapsed_time()
        target_elapsed_time = 0.0

        if forward:
            target_elapsed_time = current_elapsed + skip_amount_sec
            if self.current_track_duration > 0 and target_elapsed_time >= self.current_track_duration - 1.0: # -1 to avoid small float issues
                logger.info(f"Skipping forward near end of track {self.current_track_id}, playing next.")
                return self.play_next_track(db)
        else: # backward
            target_elapsed_time = current_elapsed - skip_amount_sec
        
        target_elapsed_time = max(0.0, target_elapsed_time)
        if self.current_track_duration > 0:
             target_elapsed_time = min(target_elapsed_time, self.current_track_duration)
        
        self.paused_at_elapsed_time = target_elapsed_time 
        self._start_playback(self.current_track_path, start_offset_sec=target_elapsed_time)
        
        if self.is_playing:
            return {"status": "skipped", "track_id": self.current_track_id, "new_elapsed_time": self.get_current_elapsed_time()}
        else:
            # If playback failed, try to revert paused_at_elapsed_time to what it was before skip attempt
            self.paused_at_elapsed_time = current_elapsed 
            return {"status": "error", "message": "Failed to skip track (playback did not start)."}


    def play_next_track(self, db: Session) -> Dict[str, Any]:
        from sqlalchemy.sql.expression import func as sql_func # For random ordering in SQL
        
        next_track_model = None
        if self.random_mode:
            # Exclude current track from random selection if possible
            query = db.query(models.Track)
            if self.current_track_id:
                query = query.filter(models.Track.id != self.current_track_id)
            next_track_model = query.order_by(sql_func.random()).first()
            # If only one song and it's current, or no other songs, next_track_model might be None.
            # Fallback to any random song if above yields None and tracks exist
            if not next_track_model and db.query(models.Track).count() > 0:
                 next_track_model = db.query(models.Track).order_by(sql_func.random()).first()

        else: # Sequential mode (very basic for now: next ID in DB)
            # This needs a more robust way to determine "next" (e.g. by download_date, title, etc.)
            # For now, just pick one that's not the current one if current exists.
            query = db.query(models.Track)
            if self.current_track_id:
                # Attempt to find a track with a "greater" ID - this is not true sequential playback
                # A proper sequential would likely involve sorting by another field (e.g. an internal order or title)
                # or by using the play_history to determine what was last played in a sequence.
                # This is a placeholder for more complex sequential logic.
                next_track_model = query.filter(models.Track.id > self.current_track_id).order_by(models.Track.id).first()
                if not next_track_model: # Wrap around or pick first
                    next_track_model = query.order_by(models.Track.id).first()
            else: # No current track, just pick the "first" by ID
                next_track_model = query.order_by(models.Track.id).first()


        if not next_track_model:
            return {"status": "stopped", "message": "No tracks available to play next."}

        logger.info(f"Playing next track ({'random' if self.random_mode else 'sequential'}): {next_track_model.id} - {next_track_model.title}")
        return self.play_track(next_track_model.id, db)


    def play_previous_track(self, db: Session) -> Dict[str, Any]:
        if not self.play_history:
             return {"status": "error", "message": "Play history is empty."}

        # Current track is play_history[-1]. If len is 1, it's the only track ever played.
        if len(self.play_history) == 1 and self.current_track_id == self.play_history[-1]:
            logger.info("Only one song in history, restarting it.")
            # Fall through to play self.current_track_id from start
        elif len(self.play_history) > 1:
            self.play_history.pop()  # Remove current track
            # Previous track is now the new last element
        # If len was 0 or 1 and not current, prev_track_id will use current value or be None.

        prev_track_id = self.play_history[-1] if self.play_history else self.current_track_id

        if not prev_track_id: # Should not happen if history was not empty initially
            return {"status": "error", "message": "Could not determine previous track."}
            
        logger.info(f"Playing previous track from history: {prev_track_id}")
        # play_track will re-add prev_track_id to history if it's different from current end of history
        # This is intended: if you go prev, then prev again, it should work as expected.
        return self.play_track(prev_track_id, db)
            

    def set_volume(self, level: int) -> Dict[str, Any]:
        self.volume_level = max(0, min(100, level))
        logger.info(f"Volume set to {self.volume_level} (conceptual, no direct mpg123 control implemented here).")
        # If mpg123 process is running, one could try to change gain with `mpg123 -f <factor> <file>`
        # but this requires restarting or a more complex interaction if possible.
        return {"status": "volume_set", "level": self.volume_level}

    def get_player_status(self, db: Optional[Session] = None) -> Dict[str, Any]:
        # db session is optional, only needed if auto_play_next is triggered
        if self.is_playing and self.playback_process and self.playback_process.poll() is not None:
            logger.info(f"Playback process for {self.current_track_id} ended (song likely finished). PID: {self.playback_process.pid}")
            self.is_playing = False
            self.paused_at_elapsed_time = self.current_track_duration # Mark as fully played
            self.playback_process = None
            
            if self.auto_play_next and db: # Check if db session was provided
                logger.info(f"Auto-playing next track after {self.current_track_id} finished.")
                # This call could recursively call get_player_status if play_next_track fails immediately.
                # However, play_next_track returns a status, it doesn't directly call get_player_status.
                # Consider the implications if play_next_track needs to update the state that this function returns.
                # For now, we assume play_next_track will update the state, and this function reflects it after.
                # To avoid issues, maybe auto_play_next should be handled by the API endpoint after getting this status.
                # For now, let's keep it but be aware.
                self.play_next_track(db) # This will change current_track_id, etc.
                # After play_next_track, the status (is_playing, current_track_id) has changed.
                # We should return the *new* status.
                # So, recalculate elapsed time based on the potentially new track.
            elif self.auto_play_next and not db:
                logger.warning("auto_play_next is True, but no DB session provided to get_player_status to fetch next track.")


        elapsed = self.get_current_elapsed_time()
        # Cap elapsed time at duration, especially if song finished and duration is known.
        if self.current_track_duration > 0 and elapsed > self.current_track_duration:
            elapsed = self.current_track_duration 

        return {
            "track_id": self.current_track_id,
            "path": self.current_track_path,
            "duration": self.current_track_duration,
            "elapsed_time": elapsed,
            "is_playing": self.is_playing,
            "is_paused": self.is_paused,
            "volume": self.volume_level,
            "random_mode": self.random_mode,
            "auto_play_next": self.auto_play_next,
            "play_history_size": len(self.play_history)
        }

# Singleton instance
playback_manager = PlaybackManager()

def get_playback_manager():
    return playback_manager
