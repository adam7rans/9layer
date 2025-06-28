#!/usr/bin/env python3
import sys
from pathlib import Path
import os
from yt_dlp import YoutubeDL
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime

# Import our SQLAlchemy models and session
from db_models import SessionLocal, Album, Track, Artist, init_db

# Initialize the database tables
init_db()

def store_metadata(info, file_path):
    db = SessionLocal()
    try:
        # Determine if this is a playlist or album
        is_playlist = 'playlist_id' in info
        album_id = info['playlist_id'] if is_playlist else f"manual_{info['id']}"
        
        # Insert or get album/playlist
        album = db.query(Album).filter(Album.id == album_id).first()
        if not album:
            album = Album(
                id=album_id,
                title=info.get('playlist') or info.get('title'),
                artist=info.get('uploader'),
                type='playlist' if is_playlist else 'album',
                url=info.get('webpage_url')
            )
            db.add(album)
        
        # Insert or get track
        track = db.query(Track).filter(Track.id == info['id']).first()
        if not track:
            track = Track(
                id=info['id'],
                title=info.get('title'),
                album_id=album_id,
                position=info.get('playlist_index', 1) if is_playlist else info.get('track_number', 1),
                url=info.get('webpage_url'),
                file_path=str(file_path)
            )
            db.add(track)
        
        # Insert or get artist if available
        if artist_name := info.get('artist') or info.get('uploader'):
            artist = db.query(Artist).filter(Artist.name == artist_name).first()
            if not artist:
                artist = Artist(name=artist_name)
                db.add(artist)
        
        db.commit()
        return True
        
    except Exception as e:
        db.rollback()
        print(f"Error storing metadata: {e}")
        return False
    finally:
        db.close()

def download_video(url, audio_only=False, format=None, download_path=None):
    # Convert YouTube Music URLs to standard YouTube format
    if 'music.youtube.com' in url:
        url = url.replace('music.youtube.com', 'www.youtube.com')
    
    # Configure yt-dlp options
    ydl_opts = {
        'progress_hooks': [progress_hook],
        'ignoreerrors': True,
        'extract_flat': False,
        'writethumbnail': True,
        'postprocessors': [
            {'key': 'EmbedThumbnail', 'already_have_thumbnail': False},
            {'key': 'FFmpegMetadata'}
        ]
    }
    
    # Set output template
    outtmpl = '%(artist)s/%(album)s/%(title)s.%(ext)s'
    if download_path:
        outtmpl = f'{download_path}/{outtmpl}'
    else:
        print("Debug: Using default music path with playlist/album folders")
        outtmpl = str(Path(os.path.dirname(os.path.abspath(__file__))) / 'music' / outtmpl)
    
    if audio_only:
        ydl_opts.update({
            'format': 'bestaudio/best',
            'postprocessors': [{
                'key': 'FFmpegExtractAudio',
                'preferredcodec': 'mp3',
                'preferredquality': '192',
            }],
            'outtmpl': outtmpl,
        })
    else:
        if format:
            ydl_opts['format'] = format
        else:
            ydl_opts['format'] = 'bv*[ext=mp4]+ba[ext=m4a]/b[ext=mp4]/b/worst'
        ydl_opts['outtmpl'] = outtmpl

    try:
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            
            # Store metadata for each track
            if 'entries' in info:  # Playlist
                for entry in info['entries']:
                    if entry:
                        # Ensure we have the full entry info
                        if '_type' in entry and entry['_type'] == 'url':
                            # This is a partial entry, need to get full info
                            try:
                                entry = ydl.extract_info(entry['url'], download=False)
                            except Exception as e:
                                print(f"Error getting full info for {entry.get('url')}: {e}")
                                continue
                        
                        # Prepare the output filename
                        try:
                            out_file = ydl.prepare_filename(entry)
                            print(f"Storing metadata for: {out_file}")
                            store_metadata(entry, out_file)
                        except Exception as e:
                            print(f"Error storing metadata for {entry.get('title')}: {e}")
            else:  # Single track
                out_file = ydl.prepare_filename(info)
                print(f"Storing metadata for: {out_file}")
                store_metadata(info, out_file)
            
        print("\nDownload completed successfully!")
    except Exception as e:
        print(f"\nError downloading video: {str(e)}")
        import traceback
        traceback.print_exc()

def progress_hook(d):
    if d['status'] == 'downloading':
        percent = d.get('_percent_str', '0%')
        speed = d.get('_speed_str', '0 B/s')
        print(f"\rDownloading... {percent} at {speed}", end='')
    elif d['status'] == 'finished':
        print("\nDownload finished, now processing...")

def is_playlist_downloaded(playlist_id):
    """Check if a playlist is already fully downloaded"""
    db = SessionLocal()
    try:
        # Get playlist info
        playlist = db.query(
            Album.id,
            Album.title,
            func.count(Track.id).label('track_count'),
            Album.url
        ).outerjoin(
            Track, Album.id == Track.album_id
        ).filter(
            Album.id == playlist_id
        ).group_by(Album.id).first()
        
        if not playlist:
            return False
            
        # Get total tracks in the playlist from YouTube
        ydl_opts = {
            'quiet': True,
            'extract_flat': True,
            'force_generic_extractor': True
        }
        
        with YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(playlist.url, download=False)
            if not info or 'entries' not in info:
                return False
                
            total_tracks = len(info['entries'])
            
        # Compare counts
        return playlist.track_count >= total_tracks if total_tracks > 0 else False
        
    except Exception as e:
        print(f"Error checking playlist download status: {e}")
        return False
    finally:
        db.close()

def download_missing_playlists(playlist_urls):
    """Download only missing playlists from a list"""
    db = SessionLocal()
    try:
        # Get existing playlist IDs from database
        existing_playlists = {row[0] for row in db.query(Album.id).filter(Album.type == 'playlist').all()}
        
        # Check which playlists need to be downloaded
        playlists_to_download = []
        
        for url in playlist_urls:
            # Extract playlist ID from URL
            if 'list=' in url:
                playlist_id = url.split('list=')[1].split('&')[0]
                if playlist_id not in existing_playlists:
                    playlists_to_download.append(url)
            else:
                print(f"Skipping invalid playlist URL: {url}")
        
        # Download missing playlists
        if playlists_to_download:
            print(f"Found {len(playlists_to_download)} new playlists to download")
            for url in playlists_to_download:
                print(f"\nDownloading playlist: {url}")
                download_video(url, audio_only=True)
        else:
            print("All playlists are already downloaded")
            
    except Exception as e:
        print(f"Error processing playlists: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    if len(sys.argv) < 2 or len(sys.argv) > 5:
        print("Usage: python youtube_downloader.py \"[youtube url]\" [--audio-only] [--format <format>] [--path <download_path>]")
        sys.exit(1)
    
    url = sys.argv[1]
    audio_only = '--audio-only' in sys.argv
    format = None
    download_path = None
    
    # Properly parse all arguments
    for i, arg in enumerate(sys.argv[2:]):
        if arg.startswith('--format='):
            format = arg.split('=')[1]
        elif arg.startswith('--path='):
            download_path = arg.split('=')[1]
        elif arg == '--format' and i+2 < len(sys.argv):
            format = sys.argv[i+3]
        elif arg == '--path' and i+2 < len(sys.argv):
            download_path = sys.argv[i+3]
    
    print(f"Final parsed arguments - audio_only: {audio_only}, format: {format}, download_path: {download_path}")
    download_video(url, audio_only, format, download_path)