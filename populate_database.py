#!/usr/bin/env python3
"""
Script to populate the music database with tracks from the music directory.
"""

import os
import sys
import hashlib
from pathlib import Path
from typing import Dict, List, Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

# Add the project root to the path
sys.path.insert(0, str(Path(__file__).parent))

from backend.app.database import SessionLocal, engine
from backend.app.models import Artist, Album, Track, AlbumType, Base

def generate_track_id(file_path: str) -> str:
    """Generate a unique track ID based on file path."""
    return hashlib.md5(file_path.encode()).hexdigest()[:16]

def generate_album_id(artist: str, album: str) -> str:
    """Generate a unique album ID based on artist and album name."""
    return hashlib.md5(f"{artist}:{album}".encode()).hexdigest()[:16]

def parse_file_path(file_path: Path, music_dir: Path) -> Dict[str, str]:
    """
    Parse file path to extract artist, album, and track information.
    
    Supports formats:
    - Artist/Album/Track.mp3
    - Album - AlbumName/Track.mp3
    """
    relative_path = file_path.relative_to(music_dir)
    parts = relative_path.parts
    
    if len(parts) < 2:
        # File directly in music directory
        return {
            'artist': 'Unknown Artist',
            'album': 'Unknown Album',
            'track': file_path.stem
        }
    
    if len(parts) == 2:
        # Album - AlbumName/Track.mp3 format
        album_part = parts[0]
        if album_part.startswith('Album - '):
            album_name = album_part[8:]  # Remove 'Album - ' prefix
            artist_name = 'Various Artists'
        else:
            # Treat as Artist/Track.mp3
            artist_name = parts[0]
            album_name = 'Unknown Album'
        
        track_name = parts[1]
    else:
        # Artist/Album/Track.mp3 format
        artist_name = parts[0]
        album_name = parts[1]
        track_name = parts[2]
    
    return {
        'artist': artist_name,
        'album': album_name,
        'track': Path(track_name).stem  # Remove .mp3 extension
    }

def scan_music_directory(music_dir: Path) -> List[Dict]:
    """Scan music directory and return list of track information."""
    tracks = []
    
    print(f"Scanning music directory: {music_dir}")
    
    for file_path in music_dir.rglob("*.mp3"):
        try:
            info = parse_file_path(file_path, music_dir)
            
            tracks.append({
                'file_path': str(file_path),
                'artist': info['artist'],
                'album': info['album'],
                'title': info['track'],
                'track_id': generate_track_id(str(file_path)),
                'album_id': generate_album_id(info['artist'], info['album'])
            })
            
            if len(tracks) % 100 == 0:
                print(f"Scanned {len(tracks)} tracks...")
                
        except Exception as e:
            print(f"Error processing {file_path}: {e}")
            continue
    
    print(f"Total tracks found: {len(tracks)}")
    return tracks

def populate_database(tracks: List[Dict]) -> None:
    """Populate database with track information."""
    
    # Create tables if they don't exist
    Base.metadata.create_all(bind=engine)
    
    db = SessionLocal()
    
    try:
        # Keep track of processed artists and albums
        processed_artists = set()
        processed_albums = set()
        
        print("Populating database...")
        
        for i, track_info in enumerate(tracks):
            try:
                # Add artist if not already processed
                if track_info['artist'] not in processed_artists:
                    artist = Artist(
                        name=track_info['artist'],
                        description=None
                    )
                    
                    # Use merge to handle duplicates
                    db.merge(artist)
                    processed_artists.add(track_info['artist'])
                
                # Add album if not already processed
                album_key = (track_info['artist'], track_info['album'])
                if album_key not in processed_albums:
                    album = Album(
                        id=track_info['album_id'],
                        title=track_info['album'],
                        artist_name=track_info['artist'],
                        type=AlbumType.album,
                        url=None
                    )
                    
                    db.merge(album)
                    processed_albums.add(album_key)
                
                # Add track
                track = Track(
                    id=track_info['track_id'],
                    title=track_info['title'],
                    album_id=track_info['album_id'],
                    position=None,
                    url=None,
                    file_path=track_info['file_path'],
                    likeability=0
                )
                
                db.merge(track)
                
                # Commit every 50 tracks to avoid large transactions
                if (i + 1) % 50 == 0:
                    db.commit()
                    print(f"Processed {i + 1}/{len(tracks)} tracks...")
                    
            except Exception as e:
                print(f"Error adding track {track_info['title']}: {e}")
                db.rollback()
                continue
        
        # Final commit
        db.commit()
        print(f"Successfully populated database with {len(tracks)} tracks!")
        
        # Print summary
        artist_count = db.query(Artist).count()
        album_count = db.query(Album).count()
        track_count = db.query(Track).count()
        
        print(f"\nDatabase summary:")
        print(f"- Artists: {artist_count}")
        print(f"- Albums: {album_count}")
        print(f"- Tracks: {track_count}")
        
    except Exception as e:
        print(f"Error populating database: {e}")
        db.rollback()
        raise
    finally:
        db.close()

def main():
    """Main function to populate the database."""
    music_dir = Path("/Users/7racker/Documents/9layer/music")
    
    if not music_dir.exists():
        print(f"Music directory not found: {music_dir}")
        sys.exit(1)
    
    print("Starting database population...")
    
    # Scan music directory
    tracks = scan_music_directory(music_dir)
    
    if not tracks:
        print("No tracks found in music directory")
        sys.exit(1)
    
    # Populate database
    populate_database(tracks)
    
    print("Database population completed!")

if __name__ == "__main__":
    main()