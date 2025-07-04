import logging
from pathlib import Path
from yt_dlp import YoutubeDL
from sqlalchemy.orm import Session
from .. import models, schemas
from ..config import MUSIC_DOWNLOAD_DIR, AUDIO_FORMAT, AUDIO_POSTPROCESSOR_OPTS, OUTPUT_TEMPLATE
from ..models import AlbumType
import sys
import os


logger = logging.getLogger(__name__)
# Basic config for logging. Consider moving to main.py or a logging config file for more complex setups.
# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')


def store_track_metadata(db: Session, track_info: dict, file_path: str):
    # Determine if this is part of a playlist/album
    # yt-dlp info extraction details:
    # 'id': video id
    # 'title': video title
    # 'artist': song artist (often None for non-music videos)
    # 'album': song album (often None)
    # 'playlist_id': playlist id if part of a playlist
    # 'playlist_title': playlist title if part of a playlist
    # 'playlist_index': index in playlist
    # 'track_number': track number in album (often None)
    # 'webpage_url': video URL
    # 'playlist_webpage_url': playlist URL (present if part of playlist)


    is_playlist = 'playlist_id' in track_info and track_info['playlist_id']
    album_id_str = str(track_info['playlist_id']) if is_playlist else f"single_{track_info['id']}"
    album_title = track_info.get('playlist_title') if is_playlist else track_info.get('album', 'Unknown Album')
    # Use 'uploader' or 'channel' if 'artist' is not available, or default to 'Unknown Artist'
    artist_name = track_info.get('artist') or track_info.get('uploader') or track_info.get('channel', 'Unknown Artist')


    # Ensure artist exists
    db_artist = db.query(models.Artist).filter(models.Artist.name == artist_name).first()
    if not db_artist and artist_name:
        db_artist = models.Artist(name=artist_name)
        db.add(db_artist)
        # logger.info(f"Adding new artist: {artist_name}")


    # Ensure album/playlist exists
    db_album = db.query(models.Album).filter(models.Album.id == album_id_str).first()
    if not db_album:
        db_album = models.Album(
            id=album_id_str,
            title=album_title,
            artist_name=artist_name,
            type=AlbumType.playlist if is_playlist else AlbumType.album,
            url=track_info.get('playlist_webpage_url') if is_playlist else track_info.get('webpage_url')
        )
        db.add(db_album)
        # logger.info(f"Adding new album/playlist: {album_title}")
    elif not db_album.artist_name and artist_name:
        # If album exists but is missing an artist name, update it.
        # This can happen if tracks from the same album/playlist are added over time
        # and the artist name was only available on later tracks.
        db_album.artist_name = artist_name
        logger.info(f"Updating existing album '{db_album.title}' with artist: {artist_name}")

    # Create track
    # Check if track already exists by ID
    db_track = db.query(models.Track).filter(models.Track.id == str(track_info['id'])).first()
    if db_track:
        logger.info(f"Track already exists: {db_track.title}. Updating metadata if necessary.")
        # Update fields if needed, e.g., file_path if it changed (though unlikely for same ID)
        db_track.title = track_info.get('title', 'Unknown Title')
        db_track.album_id = db_album.id # Ensure album link is correct
        db_track.position = track_info.get('playlist_index') if is_playlist else track_info.get('track_number')
        db_track.url = track_info.get('webpage_url')
        db_track.file_path = str(file_path) # Update file path in case it changed
    else:
        db_track = models.Track(
            id=str(track_info['id']),
            title=track_info.get('title', 'Unknown Title'),
            album_id=db_album.id,
            position=track_info.get('playlist_index') if is_playlist else track_info.get('track_number'),
            url=track_info.get('webpage_url'),
            file_path=str(file_path)
        )
        db.add(db_track)
        logger.info(f"Adding new track: {db_track.title}")
    
    return db_track

def ydl_progress_hook_for_logging(d):
    if d['status'] == 'downloading':
        logger.info(f"Downloading {d.get('filename', '')}: {d.get('_percent_str', '0%')} of {d.get('_total_bytes_str', 'N/A')} at {d.get('_speed_str', 'N/A')}")
    elif d['status'] == 'finished':
        # The filename here is the original, pre-postprocessing one.
        logger.info(f"Finished downloading {d.get('filename', '')}, now postprocessing...")
    elif d['status'] == 'error':
        logger.error(f"Error downloading {d.get('filename', '')}.")


def download_youtube_url(url: str, db: Session, schemas):
    # Construct the full path for yt-dlp's outtmpl
    # This path is a template, yt-dlp fills in title, ext, etc.
    # MUSIC_DOWNLOAD_DIR is the root directory where 'artist/album/title.ext' structure will be created.
    download_output_template_path = str(MUSIC_DOWNLOAD_DIR / OUTPUT_TEMPLATE)
    
    ydl_opts = {
        'format': AUDIO_FORMAT,
        'postprocessors': [AUDIO_POSTPROCESSOR_OPTS.copy()], # Use a copy to avoid modification issues if any
        'outtmpl': download_output_template_path, # yt-dlp will use this to create final paths
        'ignoreerrors': True, # Continue with playlist if one item fails
        'extractflat': False, 
        'writethumbnail': True,
        'progress_hooks': [ydl_progress_hook_for_logging],
        # 'verbose': True, # Uncomment for detailed yt-dlp logs
        'restrictfilenames': True, # For safer filenames
        'windowsfilenames': sys.platform == 'win32', # Adjust for windows if necessary
        'postprocessor_args': { # Additional args for postprocessors
             'embedthumbnail': True, # Ensure thumbnail is embedded
             'metadata': True,      # Ensure metadata is written
        },
        # To get the final filename after postprocessing, we can use a custom hook,
        # or rely on the information passed to store_track_metadata.
        # yt-dlp usually provides `info['filepath']` after download and postprocessing for each entry.
    }

    downloaded_tracks_metadata_orm = []
    try:
        with YoutubeDL(ydl_opts) as ydl:
            # `download=True` is implied by not setting `download=False`
            info = ydl.extract_info(url, download=True) 
            
            if not info:
                logger.error(f"yt-dlp could not extract info for URL: {url}")
                return {"status": "error", "message": "Failed to extract video information.", "downloaded_tracks": []}

            entries_to_process = []
            if 'entries' in info and info['entries']:  # Playlist or multi-video URL
                entries_to_process = [e for e in info['entries'] if e] # Filter out None entries
            elif info:  # Single track (but extract_info might still produce it in 'entries')
                # Check if it's a single video that wasn't wrapped in entries
                if 'id' in info: # Likely a single video dictionary
                     entries_to_process = [info]

            if not entries_to_process:
                logger.warning(f"No valid entries found to process for URL: {url}. Info dump: {info}")
                return {"status": "success", "message": "No tracks processed (no valid entries).", "downloaded_tracks": []}

            for entry in entries_to_process:
                # The actual path of the downloaded and processed file is crucial.
                # yt-dlp, after postprocessing, should ideally update the 'filepath' in the entry dict.
                # If 'filepath' is not in 'entry' after download, we must construct it.
                # This was a major point of fragility.
                
                # Default to entry['filepath'] if yt-dlp provides it after postprocessing
                final_file_path_str = entry.get('filepath')

                if not final_file_path_str:
                    # Fallback: Reconstruct the path if 'filepath' is not available.
                    # This assumes the 'outtmpl' and postprocessor settings consistently produce predictable paths.
                    # Create a dummy YDL object just for filename preparation (safer)
                    temp_ydl_for_path = YoutubeDL({'outtmpl': download_output_template_path, 'restrictfilenames': True, 'windowsfilenames': sys.platform == 'win32'})
                    # The filename from prepare_filename will have the original extension.
                    base_path_from_template = Path(temp_ydl_for_path.prepare_filename(entry))
                    # Apply the postprocessor's codec extension.
                    final_file_path = base_path_from_template.with_suffix('.' + AUDIO_POSTPROCESSOR_OPTS['preferredcodec'])
                    final_file_path_str = str(final_file_path)
                    logger.warning(f"Entry for '{entry.get('title')}' did not contain 'filepath'. Reconstructed as: {final_file_path_str}")
                else:
                     logger.info(f"Using 'filepath' from entry for '{entry.get('title')}': {final_file_path_str}")


                if Path(final_file_path_str).exists():
                    track_orm = store_track_metadata(db, entry, final_file_path_str)
                    if track_orm: # store_track_metadata should return the ORM object
                         downloaded_tracks_metadata_orm.append(track_orm)
                else:
                    logger.warning(f"File not found after download and postprocessing: {final_file_path_str} for entry {entry.get('title')}. Check yt-dlp output template, postprocessing, and permissions.")
            
            if downloaded_tracks_metadata_orm:
                db.commit() # Commit all changes at once
                logger.info(f"Successfully committed {len(downloaded_tracks_metadata_orm)} tracks/metadata to DB for URL: {url}")
            else:
                # db.rollback() # No changes to commit, but good practice if there were other potential changes
                logger.info(f"No new tracks were processed or committed to DB for URL: {url}")


    except Exception as e:
        db.rollback() # Rollback in case of any error during the process
        logger.error(f"Error during download or metadata storage for {url}: {e}", exc_info=True) # Log full traceback
        return {"status": "error", "message": str(e), "downloaded_tracks": []}
    
    # Convert ORM objects to Pydantic schemas for the response
    downloaded_tracks_pydantic = [schemas.Track.from_orm(track) for track in downloaded_tracks_metadata_orm]
    return {"status": "success", "downloaded_tracks": downloaded_tracks_pydantic, "message": f"Processed {len(downloaded_tracks_pydantic)} tracks."}

def initial_data_load():
    if os.getenv("TESTING_ENV") == "true":
        logger.info("TESTING_ENV is true, skipping initial_data_load.")
        return

    db = SessionLocal() 
    # Rest of the function remains the same
