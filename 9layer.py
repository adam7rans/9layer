#!/usr/bin/env python3
import os
import random
import subprocess
import sys
import time
import threading
from queue import Queue, Empty
from pathlib import Path
import termios
import collections
import signal
import platform
import ctypes
import ctypes.util
from datetime import datetime, timedelta

# macOS-specific imports
try:
    import objc
    from Foundation import NSBundle, NSObject, NSRunLoop, NSDate
    from AppKit import NSApplication, NSApp, NSApplicationActivationPolicyAccessory
    MACOS_AVAILABLE = True
except ImportError:
    MACOS_AVAILABLE = False

# Cassette animation frames (simplified)
CASSETTE_FRAMES = [
    "╭───────╮\n│▒▒▒▒▒▒ │\n╰───────╯",
    "╭───────╮\n│▒ ▒▒▒▒ │\n╰───────╯",
    "╭───────╮\n│▒▒ ▒▒▒ │\n╰───────╯",
    "╭───────╮\n│▒▒▒ ▒▒ │\n╰───────╯",
    "╭───────╮\n│▒▒▒▒ ▒ │\n╰───────╯",
    "╭───────╮\n│▒▒▒▒▒  │\n╰───────╯"
]

SUPPORTED_FORMATS = ('.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac')
SCRIPT_DIR = Path(os.path.dirname(os.path.abspath(__file__)))
MUSIC_DIR = str(SCRIPT_DIR / 'music')
PLAYER_CMD = 'mpg123'

class MusicPlayer:
    def __init__(self):
        self.music_files = []
        self.current_index = 0
        self.playback_process = None
        self.caffeinate_process = None
        self.running = False
        self.command_queue = Queue()
        self.random_mode = True
        self.volume = 50
        self.muted = False
        self._term_settings = None
        self.auto_play = True
        self.song_start_time = 0
        self.song_duration = 0
        self.elapsed_time = 0
        self.progress = 0
        self.play_history = collections.deque(maxlen=50)
        self.last_activity_time = time.time()
        self.inactivity_timeout = 3600  # 1 hour in seconds
        self.idle_monitor_thread = None
        self._setup_sleep_prevention()
        self._start_idle_monitor()

    def find_music_files(self):
        files = []
        if not Path(MUSIC_DIR).is_dir():
            print(f"ERROR: Music directory does not exist: {MUSIC_DIR}")
            return files
        for root, _, filenames in os.walk(MUSIC_DIR):
            for f in filenames:
                if f.lower().endswith(SUPPORTED_FORMATS):
                    files.append(os.path.join(root, f))
        return files

    def get_song_duration(self, file_path):
        try:
            cmd = f"ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 '{file_path}'"
            duration_str = subprocess.check_output(cmd, shell=True, stderr=subprocess.DEVNULL, text=True).strip()
            duration = float(duration_str)
            return int(duration)
        except Exception as e:
            # print(f"DEBUG: Failed to get duration for {file_path}: {e}")
            return 0

    def format_time(self, seconds):
        return f"{seconds//60}:{seconds%60:02d}"

    def get_progress_bar(self, progress, width=60):
        filled = min(int(round(width * progress)), width)
        return f"{'=' * filled}\033[38;5;236m{'-' * (width - filled)}\033[0m"

    def play_current_song(self, start_time_sec=0, played_from_history=False):
        if not self.music_files:
            self.refresh_ui_stopped() 
            return

        if self.playback_process:
            if self.playback_process.stdin and not self.playback_process.stdin.closed:
                try:
                    self.playback_process.stdin.write(b"Q\n")
                    self.playback_process.stdin.flush()
                except (IOError, BrokenPipeError): pass
            self.playback_process.terminate()
            try:
                self.playback_process.wait(timeout=0.5)
            except subprocess.TimeoutExpired:
                self.playback_process.kill()
            self.playback_process = None

        if not played_from_history:
            if not self.play_history or self.play_history[-1] != self.current_index:
                self.play_history.append(self.current_index)

        full_song_path = self.music_files[self.current_index]
        album = os.path.basename(os.path.dirname(full_song_path))
        song_dir = os.path.dirname(full_song_path)
        song_filename = os.path.basename(full_song_path)

        print("\033[2J\033[H", end="") 
        print("\033[0;0HNow Playing ...")
        print(f"\033[1;0H{song_filename[:80]}") 
        print("\033[2;0Hfrom")
        print(f"\033[3;0H{album[:80]}")   

        static_frame = CASSETTE_FRAMES[0]
        for i, line in enumerate(static_frame.split('\n')):
            print(f"\033[{5+i};0H{line}")
        sys.stdout.flush() 

        if self.song_duration == 0 or start_time_sec == 0: 
            self.song_duration = self.get_song_duration(full_song_path)

        self.song_start_time = time.time() - start_time_sec
        self.elapsed_time = start_time_sec
        
        cmd = [PLAYER_CMD, '-q']

        # Add volume factor using -f (scale output samples)
        # mpg123 -f expects an integer, default is 32768 for 100% volume.
        vol_factor_int = 0 if self.muted else int((self.volume / 100.0) * 32768)
        cmd.extend(['-f', str(vol_factor_int)])

        if start_time_sec > 0:
            cmd.append('-k')
            cmd.append(str(start_time_sec))

        cmd.append(song_filename)

        try:
            self.playback_process = subprocess.Popen(
                cmd,
                cwd=song_dir,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.PIPE
            )
            time.sleep(0.2) # Give it a moment to start or fail
            if self.playback_process.poll() is not None:
                pass # Process exited quickly, player_loop will handle advancing
        except FileNotFoundError:
            print(f"\n\033[15;0HERROR: PLAYER_CMD '{PLAYER_CMD}' not found.")
            self.running = False 
            self.playback_process = None
        except Exception as e:
            print(f"\n\033[15;0HERROR: Failed to start playback process: {e}")
            self.playback_process = None
        
        sys.stdout.flush()

        if self.playback_process and self.playback_process.poll() is None:
            anim_thread = threading.Thread(target=self.animate_playback)
            anim_thread.daemon = True
            anim_thread.start()
        else: 
            self.playback_process = None 
            if self.running: 
                if self.auto_play:
                    self.command_queue.put('next')
                else:
                    self.refresh_ui_stopped() 

    def animate_playback(self): 
        frame_idx = 0
        while self.running and self.playback_process and self.playback_process.poll() is None:
            # ... (animation code remains the same)
            frame = CASSETTE_FRAMES[frame_idx % len(CASSETTE_FRAMES)]
            for i, line in enumerate(frame.split('\n')):
                print(f"\033[{5+i};0H{line}")

            current_time_for_elapsed = time.time()
            self.elapsed_time = int(current_time_for_elapsed - self.song_start_time)
            
            if self.song_duration > 0:
                self.elapsed_time = min(self.elapsed_time, self.song_duration)

            progress = min(self.elapsed_time / self.song_duration, 1.0) if self.song_duration > 0 else 0

            time_display = f"{self.format_time(self.elapsed_time)} / {self.format_time(self.song_duration) if self.song_duration > 0 else '--:--'}"
            print(f"\033[8;0H\033[K{time_display}")

            progress_bar = self.get_progress_bar(progress)
            print(f"\033[9;0H\033[K{progress_bar}")

            print(f"\033[11;0H\033[KRandom: {'ON' if self.random_mode else 'OFF'} | Volume: {'🔇 MUTED' if self.muted else '🔊 '+str(self.volume)+'%'} | AutoPlay: {'ON' if self.auto_play else 'OFF'}")
            print(f"\033[12;0H\033[KControls: [N]ext [P]rev [,]SkipBack [.]SkipNext [R]andom [A]utoPlay [=]Vol+ [-]Vol- [M]ute [Q]uit")
            sys.stdout.flush()
            time.sleep(0.1)
            frame_idx += 1


    def set_volume(self, change=None, mute=None):
        if sys.platform != 'darwin':
            return

        old_volume = self.volume
        old_muted = self.muted

        if mute is not None:
            self.muted = mute
        
        if change:
            self.volume = max(0, min(100, self.volume + change))
            self.muted = False

        # Check if effective volume/mute state changed
        effective_volume_changed = (self.volume != old_volume) or (self.muted != old_muted)

        # If effective state changed and a song is playing, restart it with new settings
        if effective_volume_changed and self.playback_process and self.playback_process.poll() is None:
            current_elapsed_time = self.elapsed_time
            # Pass played_from_history=True to prevent adding to history again
            self.play_current_song(start_time_sec=current_elapsed_time, played_from_history=True)


    def stop(self):
        self.running = False
        if self.playback_process:
            if self.playback_process.stdin and not self.playback_process.stdin.closed:
                try:
                    self.playback_process.stdin.write(b"Q\n")
                    self.playback_process.stdin.flush()
                except (IOError, BrokenPipeError): pass # Ignore if pipe already closed
            self.playback_process.terminate()
            try:
                self.playback_process.wait(timeout=1)
            except subprocess.TimeoutExpired:
                self.playback_process.kill()
            self.playback_process = None
        if self._term_settings and sys.stdin.isatty():
            termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, self._term_settings)

    def refresh_ui_stopped(self):
        if not self.music_files:
            print("\033[2J\033[H", end="") 
            print("\033[0;0HNo music files found.")
            static_frame = CASSETTE_FRAMES[0] 
            for i, line in enumerate(static_frame.split('\n')):
                print(f"\033[{5+i};0H{line}")
        elif not (self.playback_process and self.playback_process.poll() is None):
            # If a song is selected but not playing, ensure its info is displayed
            # This is now largely handled by play_current_song drawing initial UI,
            # or player_loop drawing selected song UI if not autoplaying.
            pass


        duration_to_display = self.song_duration
        current_song_path = self.music_files[self.current_index] if self.music_files and 0 <= self.current_index < len(self.music_files) else None
        if duration_to_display == 0 and current_song_path:
            # Consider if get_song_duration should be called here for accuracy, but it's slow.
            # For now, if it's 0 from a previous state, it'll show --:-- which is fine for stopped.
            pass

        print(f"\033[8;0H\033[K--:-- / {self.format_time(duration_to_display) if duration_to_display > 0 else '--:--'}")
        print(f"\033[9;0H\033[K{self.get_progress_bar(0)}")
        print(f"\033[11;0H\033[KRandom: {'ON' if self.random_mode else 'OFF'} | Volume: {'🔇 MUTED' if self.muted else '🔊 '+str(self.volume)+'%'} | AutoPlay: {'ON' if self.auto_play else 'OFF'}")
        print(f"\033[12;0H\033[KControls: [N]ext [P]rev [,]SkipBack [.]SkipNext [R]andom [A]utoPlay [=]Vol+ [-]Vol- [M]ute [Q]uit")
        sys.stdout.flush()


    def player_loop(self):
        self.running = True
        input_thread = threading.Thread(target=self.input_handler)
        input_thread.daemon = True
        input_thread.start()

        self.music_files = self.find_music_files()

        if not self.music_files:
            print("\033[2J\033[H", end="")
            print("No music files found in 'music' directory. Controls active. Press Q to quit.")
            self.refresh_ui_stopped() 
            while self.running:
                try:
                    cmd_from_queue = self.command_queue.get(timeout=0.1)
                    if cmd_from_queue == 'stop':
                        self.running = False
                except Empty:
                    continue
            self.stop()
            return

        if self.random_mode:
            self.current_index = random.randint(0, len(self.music_files) - 1)
        else:
            self.current_index = 0
        
        if not self.auto_play:
            full_song_path = self.music_files[self.current_index]
            album = os.path.basename(os.path.dirname(full_song_path))
            song_filename = os.path.basename(full_song_path)
            print("\033[2J\033[H", end="")
            print(f"\033[0;0HSelected: {song_filename[:80]}")
            print(f"\033[1;0HFrom: {album[:80]}")
            static_frame = CASSETTE_FRAMES[0]
            for i, line in enumerate(static_frame.split('\n')):
                print(f"\033[{5+i};0H{line}")
            self.song_duration = self.get_song_duration(full_song_path)
            self.refresh_ui_stopped()

        if self.auto_play:
            self.play_current_song()
        
        try:
            while self.running:
                if self.playback_process and self.playback_process.poll() is not None:
                    self.playback_process = None
                    if self.auto_play and self.running:
                        self.command_queue.put('next')
                    elif self.running:
                         self.refresh_ui_stopped()

                try:
                    cmd_from_queue = self.command_queue.get(timeout=0.1)
                except Empty:
                    continue

                action_processed_updates_ui = False # True if command starts playback or seek

                if cmd_from_queue == 'stop':
                    self.running = False
                    break 
                elif cmd_from_queue == 'next':
                    if not self.music_files: continue
                    if self.random_mode:
                        if len(self.music_files) > 1:
                            prev_idx = self.current_index
                            new_idx = self.current_index
                            # Ensure different song if possible, limit attempts for safety
                            attempts = 0
                            while new_idx == prev_idx and attempts < len(self.music_files) * 2:
                                new_idx = random.randint(0, len(self.music_files) - 1)
                                attempts +=1
                            self.current_index = new_idx
                    else: 
                        self.current_index = (self.current_index + 1) % len(self.music_files)
                    self.song_duration = 0 
                    self.play_current_song()
                    action_processed_updates_ui = True
                elif cmd_from_queue == 'prev':
                    if not self.music_files: continue
                    if len(self.play_history) >= 2: 
                        self.play_history.pop() 
                        self.current_index = self.play_history[-1] 
                        self.song_duration = 0
                        self.play_current_song(played_from_history=True) 
                    else: 
                        self.current_index = (self.current_index - 1 + len(self.music_files)) % len(self.music_files)
                        self.song_duration = 0
                        self.play_history.clear() 
                        self.play_current_song()
                    action_processed_updates_ui = True
                elif cmd_from_queue == 'random':
                    self.random_mode = not self.random_mode
                elif cmd_from_queue == 'vol_up':
                    self.set_volume(change=10)
                elif cmd_from_queue == 'vol_down':
                    self.set_volume(change=-10)
                elif cmd_from_queue == 'mute':
                    self.set_volume(mute=not self.muted)
                elif cmd_from_queue == 'autoplay':
                    self.auto_play = not self.auto_play
                elif cmd_from_queue == 'skip_backward':
                    self.skip_backward() 
                    action_processed_updates_ui = True 
                elif cmd_from_queue == 'skip_forward':
                    self.skip_forward()
                    action_processed_updates_ui = True
                
                if not action_processed_updates_ui and not (self.playback_process and self.playback_process.poll() is None):
                    self.refresh_ui_stopped() 
        finally:
            self.stop()

    def skip_backward(self):
        if not self.music_files: return
        if not self.playback_process or self.playback_process.poll() is not None:
            self.song_duration = 0
            self.play_current_song(start_time_sec=0)
            return

        if self.playback_process.stdin and not self.playback_process.stdin.closed:
            jump_cmd_str = "JUMP -15s\n"
            try:
                print(f"DEBUG: Sending JUMP to mpg123 stdin: '{jump_cmd_str.strip()}'")
                self.playback_process.stdin.write(jump_cmd_str.encode())
                self.playback_process.stdin.flush()
                print(f"DEBUG: JUMP command '{jump_cmd_str.strip()}' sent and flushed.")
                new_elapsed_time = max(0, self.elapsed_time - 15)
                self.song_start_time += (self.elapsed_time - new_elapsed_time) 
                self.elapsed_time = new_elapsed_time
            except (IOError, BrokenPipeError) as e:
                print(f"ERROR: Failed to send JUMP command '{jump_cmd_str.strip()}' to mpg123: {e}")
                new_pos = max(0, self.elapsed_time - 15)
                self.play_current_song(start_time_sec=new_pos) # Fallback
            except Exception as e:
                print(f"ERROR: Unexpected error sending JUMP command '{jump_cmd_str.strip()}': {e}")
        else: 
            new_pos = max(0, self.elapsed_time - 15)
            self.play_current_song(start_time_sec=new_pos)


    def skip_forward(self):
        if not self.music_files: return
        if not self.playback_process or self.playback_process.poll() is not None:
            self.command_queue.put('next')
            return
        
        if self.playback_process.stdin and not self.playback_process.stdin.closed:
            jump_cmd_str = "JUMP +15s\n"
            try:
                if self.song_duration > 0 and self.elapsed_time + 15 >= self.song_duration -1: 
                    self.command_queue.put('next')
                    return
                print(f"DEBUG: Sending JUMP to mpg123 stdin: '{jump_cmd_str.strip()}'")
                self.playback_process.stdin.write(jump_cmd_str.encode())
                self.playback_process.stdin.flush()
                print(f"DEBUG: JUMP command '{jump_cmd_str.strip()}' sent and flushed.")
                new_elapsed_time = self.elapsed_time + 15
                if self.song_duration > 0:
                    new_elapsed_time = min(new_elapsed_time, self.song_duration)
                self.song_start_time -= (new_elapsed_time - self.elapsed_time) 
                self.elapsed_time = new_elapsed_time
            except (IOError, BrokenPipeError) as e:
                print(f"ERROR: Failed to send JUMP command '{jump_cmd_str.strip()}' to mpg123: {e}")
                self.fallback_skip_forward_restart()
            except Exception as e:
                print(f"ERROR: Unexpected error sending JUMP command '{jump_cmd_str.strip()}': {e}")
        else: 
            self.fallback_skip_forward_restart()

    def fallback_skip_forward_restart(self): 
        new_pos = self.elapsed_time + 15
        if self.song_duration > 0 and new_pos >= self.song_duration - 1:
            self.command_queue.put('next')
        else:
            if self.song_duration > 0: new_pos = min(new_pos, self.song_duration)
            new_pos = max(0,new_pos)
            self.play_current_song(start_time_sec=new_pos)


    def _setup_sleep_prevention(self):
        """Setup system sleep prevention on macOS
        
        Uses caffeinate with -i (idle sleep) to prevent system sleep while
        allowing display sleep. The -i flag prevents idle system sleep, while
        allowing the display to sleep.
        """
        if sys.platform != 'darwin':
            return
            
        try:
            # Disable App Nap
            if MACOS_AVAILABLE:
                bundle = NSBundle.mainBundle()
                if bundle:
                    info = bundle.localizedInfoDictionary() or bundle.infoDictionary()
                    if info:
                        info['NSAppSleepDisabled'] = True
            
            # Kill any existing caffeinate processes
            try:
                subprocess.run(['pkill', '-f', 'caffeinate'], 
                             stdout=subprocess.PIPE, 
                             stderr=subprocess.PIPE)
            except Exception:
                pass
                
            # Start caffeinate with -i to prevent system sleep but allow display sleep
            # -i: Prevent system sleep, but allow display sleep
            self.caffeinate_process = subprocess.Popen(
                ['caffeinate', '-i'],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                stdin=subprocess.PIPE
            )
            print("Sleep prevention: System will not sleep, but display may sleep normally")
                
        except Exception as e:
            print(f"Warning: Could not prevent system sleep: {e}")
            print("Note: Your system might go to sleep, which could stop audio playback")

    def _cleanup_sleep_prevention(self):
        """Clean up sleep prevention"""
        if sys.platform != 'darwin':
            return
            
        # Clean up our process if it exists
        if hasattr(self, 'caffeinate_process') and self.caffeinate_process:
            try:
                self.caffeinate_process.terminate()
                self.caffeinate_process.wait(timeout=2)
            except (subprocess.TimeoutExpired, ProcessLookupError):
                if self.caffeinate_process:
                    self.caffeinate_process.kill()
            self.caffeinate_process = None
        
        # Clean up any other caffeinate processes
        try:
            subprocess.run(['pkill', '-f', 'caffeinate'], 
                         stdout=subprocess.PIPE, 
                         stderr=subprocess.PIPE)
        except Exception:
            pass

    def _start_idle_monitor(self):
        """Start monitoring for user inactivity"""
        self.idle_monitor_thread = threading.Thread(target=self._idle_monitor_loop, daemon=True)
        self.idle_monitor_thread.start()

    def _idle_monitor_loop(self):
        """Monitor user activity and shut down after timeout"""
        while self.running:
            idle_time = self._get_idle_time()
            if idle_time > self.inactivity_timeout:
                print("\nInactivity timeout reached. Shutting down...")
                self.stop()
                os._exit(0)
            time.sleep(10)  # Check every 10 seconds

    def _get_idle_time(self):
        """Get system idle time in seconds"""
        if sys.platform == 'darwin':
            try:
                # Use ctypes to call into the macOS CoreGraphics framework
                ctypes.cdll.LoadLibrary(ctypes.util.find_library('CoreGraphics'))
                event = ctypes.c_uint32(0)
                event = ctypes.c_uint64.in_dll(ctypes.cdll.CoreGraphics, 'kCGAnyInputEventType')
                
                # CGEventSourceSecondsSinceLastEventType
                idle_time = ctypes.c_double.in_dll(
                    ctypes.cdll.CoreGraphics, 
                    'CGEventSourceSecondsSinceLastEventType'
                )(
                    ctypes.c_uint32(0),  # kCGEventSourceStateCombinedSessionState
                    ctypes.c_uint32(event.value)  # kCGAnyInputEventType
                )
                return idle_time
            except Exception as e:
                # Fallback to simpler method if the above fails
                return time.time() - self.last_activity_time
        return time.time() - self.last_activity_time

    def update_activity(self):
        """Update the last activity timestamp"""
        self.last_activity_time = time.time()

    def cleanup(self):
        self.running = False
        if self.playback_process:
            try:
                self.playback_process.terminate()
                self.playback_process.wait(timeout=2)
            except (subprocess.TimeoutExpired, ProcessLookupError):
                if self.playback_process:
                    self.playback_process.kill()
            self.playback_process = None
        self._cleanup_sleep_prevention()

    def input_handler(self):
        import tty 
        fd = sys.stdin.fileno()
        if not sys.stdin.isatty(): 
            return 
        try:
            self._term_settings = termios.tcgetattr(fd)
        except termios.error:
            return 
        try:
            tty.setraw(fd)
            while self.running:
                try:
                    ch = sys.stdin.read(1)
                    if not self.running: break 
                    if ch == 'q': self.command_queue.put('stop'); break
                    elif ch == 'n': self.command_queue.put('next')
                    elif ch == 'p': self.command_queue.put('prev')
                    elif ch == ',': self.command_queue.put('skip_backward')
                    elif ch == '.': self.command_queue.put('skip_forward')
                    elif ch == 'r': self.command_queue.put('random')
                    elif ch == '=' or ch == '+': self.command_queue.put('vol_up')
                    elif ch == '-': self.command_queue.put('vol_down')
                    elif ch == 'm': self.command_queue.put('mute')
                    elif ch == 'a': self.command_queue.put('autoplay')
                except Exception: break 
        except Exception: pass
        finally:
            if self._term_settings and sys.stdin.isatty(): 
                termios.tcsetattr(fd, termios.TCSADRAIN, self._term_settings)

    def run(self):
        sys.stdout.write("\033[?25l") 
        sys.stdout.flush()
        print("Scanning music directory...") 
        player_thread = threading.Thread(target=self.player_loop)
        player_thread.daemon = False 
        player_thread.start()
        try:
            player_thread.join() 
        except KeyboardInterrupt:
            print("\nStopping player...") 
            self.command_queue.put('stop') 
            if player_thread.is_alive():
                player_thread.join(timeout=2) 
        finally:
            if self.running: self.stop() 
            sys.stdout.write("\033[?25h") 
            sys.stdout.flush()
            print("Player stopped. Bye!")

if __name__ == "__main__":
    if not sys.stdin.isatty():
        print("This application needs to be run in a terminal for full functionality.")
    player = MusicPlayer()
    try:
        player.run()
    except Exception as e:
        if hasattr(player, '_term_settings') and player._term_settings and sys.stdin.isatty():
            termios.tcsetattr(sys.stdin.fileno(), termios.TCSADRAIN, player._term_settings)
        sys.stdout.write("\033[?25h") 
        sys.stdout.flush()
        print(f"An unexpected error occurred: {e}")
        import traceback
        traceback.print_exc()