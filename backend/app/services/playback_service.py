import subprocess
import time
import collections
import logging
import os
import threading
from typing import Optional, Dict, Any
from sqlalchemy.orm import Session
from .. import models # For querying track paths
from ..config import MUSIC_DOWNLOAD_DIR # To locate files if paths are relative
from pathlib import Path # ensure Path is imported

logger = logging.getLogger(__name__)

PLAYER_CMD = os.getenv("MPG123_PATH", "mpg123") # Allow overriding mpg123 path

class PlaybackManager:
    def __init__(self, history_limit=50):
        self.lock = threading.Lock()
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
        # Stop any existing subprocess playback
        if self.playback_process:
            self.playback_process.terminate()
            try:
                self.playback_process.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                self.playback_process.kill()
            self.playback_process = None

        # Set playback state for browser-based audio
        self.is_playing = True
        self.is_paused = False
        self.song_start_time_monotonic = time.monotonic()
        logger.info(f"Browser playback started: {track_path} at offset {start_offset_sec}s")
    
    def _resolve_track_path(self, track_id: str, db: Session) -> Optional[str]:
        db_track = db.query(models.Track).filter(models.Track.id == track_id).first()
        if not db_track or not db_track.file_path:
            logger.error(f"Track ID {track_id} not found in DB or has no file_path.")
            return None
        
        track_file_path = Path(db_track.file_path)
        
        if not track_file_path.is_absolute():
            logger.warning(f"Track path '{db_track.file_path}' for ID {track_id} is relative. Resolving against MUSIC_DOWNLOAD_DIR.")
            track_file_path = MUSIC_DOWNLOAD_DIR / track_file_path
            track_file_path = track_file_path.resolve()


        if not track_file_path.exists():
            logger.error(f"Track file not found at resolved path: {track_file_path} for ID {track_id}")
            return None
        return str(track_file_path)


    def play_track(self, track_id: str, db: Session):
        with self.lock:
            track_path = self._resolve_track_path(track_id, db)
            if not track_path:
                self.current_track_id = None
                self.current_track_path = None
                self.current_track_duration = 0
                return

            self.current_track_id = track_id
            self.current_track_path = track_path
            self.current_track_duration = self._get_song_duration(track_path)
            self.paused_at_elapsed_time = 0.0

            if not self.play_history or self.play_history[-1] != track_id:
                 self.play_history.append(track_id)

            self._start_playback(track_path, start_offset_sec=0.0)
            if not self.is_playing:
                self.current_track_id = None
                self.current_track_path = None
                self.current_track_duration = 0

    def pause_playback(self):
        with self.lock:
            if not self.is_playing:
                return

            current_elapsed_segment = time.monotonic() - self.song_start_time_monotonic
            self.paused_at_elapsed_time += current_elapsed_segment

            # Stop any subprocess if it exists
            if self.playback_process:
                self.playback_process.terminate()
                try:
                    self.playback_process.wait(timeout=0.5)
                except subprocess.TimeoutExpired:
                    self.playback_process.kill()
                self.playback_process = None

            self.is_playing = False
            self.is_paused = True
            logger.info(f"Browser playback paused for track {self.current_track_id} at {self.paused_at_elapsed_time:.2f}s")

    def resume_playback(self):
        with self.lock:
            if not self.is_paused or not self.current_track_path:
                return

            logger.info(f"Resuming track {self.current_track_id} from {self.paused_at_elapsed_time:.2f}s")
            self._start_playback(self.current_track_path, start_offset_sec=self.paused_at_elapsed_time)

            if not self.is_playing:
                self.is_paused = True

    def stop_playback(self):
        with self.lock:
            # Stop any subprocess if it exists
            if self.playback_process:
                self.playback_process.terminate()
                try:
                    self.playback_process.wait(timeout=0.5)
                except subprocess.TimeoutExpired:
                    self.playback_process.kill()
                self.playback_process = None

            logger.info(f"Browser playback stopped for track {self.current_track_id}")
            self.is_playing = False
            self.is_paused = False
            self.song_start_time_monotonic = 0.0
            self.paused_at_elapsed_time = 0.0

    def get_current_elapsed_time(self) -> float:
        with self.lock:
            if not self.current_track_id:
                return 0.0
            if self.is_playing:
                return (time.monotonic() - self.song_start_time_monotonic) + self.paused_at_elapsed_time
            else:
                return self.paused_at_elapsed_time

    def seek_to(self, seconds: float):
        with self.lock:
            if not self.current_track_id or not self.current_track_path:
                return

            target_elapsed_time = max(0.0, seconds)
            if self.current_track_duration > 0:
                 target_elapsed_time = min(target_elapsed_time, self.current_track_duration)

            self.paused_at_elapsed_time = target_elapsed_time
            self._start_playback(self.current_track_path, start_offset_sec=target_elapsed_time)

    def play_next_track(self, db: Session):
        with self.lock:
            from sqlalchemy.sql.expression import func as sql_func
            next_track_model = None
            if self.random_mode:
                query = db.query(models.Track)
                if self.current_track_id:
                    query = query.filter(models.Track.id != self.current_track_id)
                next_track_model = query.order_by(sql_func.random()).first()
                if not next_track_model and db.query(models.Track).count() > 0:
                     next_track_model = db.query(models.Track).order_by(sql_func.random()).first()

            else:
                query = db.query(models.Track)
                if self.current_track_id:
                    next_track_model = query.filter(models.Track.id > self.current_track_id).order_by(models.Track.id).first()
                    if not next_track_model:
                        next_track_model = query.order_by(models.Track.id).first()
                else:
                    next_track_model = query.order_by(models.Track.id).first()

            if not next_track_model:
                return

            logger.info(f"Playing next track ({'random' if self.random_mode else 'sequential'}): {next_track_model.id} - {next_track_model.title}")
            self.play_track(next_track_model.id, db)

    def play_previous_track(self, db: Session):
        with self.lock:
            if not self.play_history:
                 return

            if len(self.play_history) == 1 and self.current_track_id == self.play_history[-1]:
                logger.info("Only one song in history, restarting it.")
            elif len(self.play_history) > 1:
                self.play_history.pop()

            prev_track_id = self.play_history[-1] if self.play_history else self.current_track_id

            if not prev_track_id:
                return
            
            logger.info(f"Playing previous track from history: {prev_track_id}")
            self.play_track(prev_track_id, db)
            

    def set_volume(self, level: int):
        with self.lock:
            self.volume_level = max(0, min(100, level))
            logger.info(f"Volume set to {self.volume_level} (conceptual, no direct mpg123 control implemented here).")

    def get_player_status(self, db: Optional[Session] = None) -> Dict[str, Any]:
        with self.lock:
            # Check if subprocess ended (legacy cleanup)
            if self.is_playing and self.playback_process and self.playback_process.poll() is not None:
                logger.info(f"Legacy playback process for {self.current_track_id} ended. PID: {self.playback_process.pid}")
                self.playback_process = None

            elapsed = self.get_current_elapsed_time()
            if self.current_track_duration > 0 and elapsed > self.current_track_duration:
                elapsed = self.current_track_duration 

            # Generate audio URL for browser playback
            audio_url = None
            if self.current_track_path:
                # Convert file path to URL path for static serving
                music_dir = Path("/Users/7racker/Documents/9layer/music")
                track_path = Path(self.current_track_path)
                if track_path.is_relative_to(music_dir):
                    relative_path = track_path.relative_to(music_dir)
                    audio_url = f"/api/audio/{relative_path}"
                else:
                    logger.warning(f"Track path {self.current_track_path} is not within music directory")

            return {
                "track_id": self.current_track_id,
                "path": self.current_track_path,
                "audio_url": audio_url,
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