#!/usr/bin/env python3
"""
Migrate data from SQLite to PostgreSQL for 9layer music player
Fixed to match actual PostgreSQL schema
"""

import sqlite3
import psycopg2
import os
import uuid
from datetime import datetime

# Database configurations
SQLITE_DB = 'old_sqlite_backups/music_metadata.db'
POSTGRES_CONFIG = {
    'host': 'localhost',
    'database': '9layer_dev',
    'user': '7racker',
    'password': '',
    'port': 5432
}

def generate_id():
    """Generate a unique ID"""
    return str(uuid.uuid4())

def migrate_data():
    """Migrate data from SQLite to PostgreSQL"""
    
    # Connect to SQLite
    sqlite_conn = sqlite3.connect(SQLITE_DB)
    sqlite_cursor = sqlite_conn.cursor()
    
    # Connect to PostgreSQL
    try:
        pg_conn = psycopg2.connect(**POSTGRES_CONFIG)
        pg_cursor = pg_conn.cursor()
        
        print("Connected to both databases successfully")
        
        # Clear existing data
        print("Clearing existing PostgreSQL data...")
        pg_cursor.execute("DELETE FROM tracks")
        pg_cursor.execute("DELETE FROM albums")
        pg_cursor.execute("DELETE FROM artists")
        pg_conn.commit()
        
        # Create artist mapping
        artist_map = {}
        
        # Migrate artists
        print("Migrating artists...")
        sqlite_cursor.execute("SELECT DISTINCT artist FROM albums WHERE artist IS NOT NULL AND artist != ''")
        artists = sqlite_cursor.fetchall()
        
        now = datetime.now()
        for (artist_name,) in artists:
            artist_id = generate_id()
            artist_map[artist_name] = artist_id
            
            pg_cursor.execute("""
                INSERT INTO artists (id, name, "createdAt", "updatedAt") 
                VALUES (%s, %s, %s, %s) 
                ON CONFLICT (name) DO NOTHING
            """, (artist_id, artist_name, now, now))
        
        pg_conn.commit()
        print(f"Migrated {len(artists)} artists")
        
        # Create album mapping
        album_map = {}
        
        # Migrate albums
        print("Migrating albums...")
        sqlite_cursor.execute("""
            SELECT id, title, artist, type, url 
            FROM albums 
            WHERE title IS NOT NULL AND title != ''
        """)
        albums = sqlite_cursor.fetchall()
        
        for album in albums:
            album_id, title, artist, album_type, url = album
            
            # Get artist ID
            artist_id = artist_map.get(artist)
            if not artist_id:
                # Create missing artist
                artist_id = generate_id()
                artist_map[artist] = artist_id
                pg_cursor.execute("""
                    INSERT INTO artists (id, name, "createdAt", "updatedAt") 
                    VALUES (%s, %s, %s, %s) 
                    ON CONFLICT (name) DO NOTHING
                """, (artist_id, artist or 'Unknown Artist', now, now))
            
            # Map album type
            pg_album_type = 'ALBUM'
            if album_type and album_type.lower() in ['playlist', 'single', 'ep']:
                pg_album_type = album_type.upper()
            
            album_map[album_id] = album_id
            
            pg_cursor.execute("""
                INSERT INTO albums (id, title, "artistId", "albumType", "youtubeId", "createdAt", "updatedAt") 
                VALUES (%s, %s, %s, %s, %s, %s, %s) 
                ON CONFLICT (id) DO NOTHING
            """, (album_id, title, artist_id, pg_album_type, None, now, now))
        
        pg_conn.commit()
        print(f"Migrated {len(albums)} albums")
        
        # Migrate tracks
        print("Migrating tracks...")
        sqlite_cursor.execute("""
            SELECT t.id, t.title, t.album_id, t.position, t.url, t.file_path, t.download_date,
                   a.artist, a.title as album_title
            FROM tracks t
            LEFT JOIN albums a ON t.album_id = a.id
            WHERE t.title IS NOT NULL AND t.title != ''
        """)
        tracks = sqlite_cursor.fetchall()
        
        migrated_count = 0
        for track in tracks:
            track_id, title, album_id, position, url, file_path, download_date, artist, album_title = track
            
            # Get artist ID
            artist_id = artist_map.get(artist)
            if not artist_id:
                # Create missing artist
                artist_id = generate_id()
                artist_map[artist] = artist_id
                pg_cursor.execute("""
                    INSERT INTO artists (id, name, "createdAt", "updatedAt") 
                    VALUES (%s, %s, %s, %s) 
                    ON CONFLICT (name) DO NOTHING
                """, (artist_id, artist or 'Unknown Artist', now, now))
            
            # Ensure album exists
            if album_id not in album_map:
                # Create missing album
                album_map[album_id] = album_id
                pg_cursor.execute("""
                    INSERT INTO albums (id, title, "artistId", "albumType", "createdAt", "updatedAt") 
                    VALUES (%s, %s, %s, %s, %s, %s) 
                    ON CONFLICT (id) DO NOTHING
                """, (album_id, album_title or 'Unknown Album', artist_id, 'ALBUM', now, now))
            
            # Extract YouTube ID from URL
            youtube_id = None
            if url and 'youtube.com/watch?v=' in url:
                youtube_id = url.split('v=')[1].split('&')[0]
            elif url and 'youtu.be/' in url:
                youtube_id = url.split('youtu.be/')[1].split('?')[0]
            
            try:
                pg_cursor.execute("""
                    INSERT INTO tracks (id, title, "artistId", "albumId", duration, "filePath", "fileSize", "youtubeId", likeability, "createdAt", "updatedAt") 
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s) 
                """, (
                    track_id, 
                    title, 
                    artist_id,
                    album_id,
                    0,  # duration placeholder
                    file_path or '',
                    0,  # fileSize placeholder
                    youtube_id,
                    0,  # likeability default
                    now,
                    now
                ))
                migrated_count += 1
            except psycopg2.IntegrityError:
                # Skip duplicates
                continue
            
            if migrated_count % 100 == 0:
                print(f"Migrated {migrated_count} tracks...")
                pg_conn.commit()
        
        pg_conn.commit()
        print(f"Migrated {migrated_count} tracks total")
        
        # Verify migration
        pg_cursor.execute("SELECT COUNT(*) FROM tracks")
        track_count = pg_cursor.fetchone()[0]
        
        pg_cursor.execute("SELECT COUNT(*) FROM albums")
        album_count = pg_cursor.fetchone()[0]
        
        pg_cursor.execute("SELECT COUNT(*) FROM artists")
        artist_count = pg_cursor.fetchone()[0]
        
        print(f"\nMigration complete!")
        print(f"PostgreSQL now has:")
        print(f"  - {track_count} tracks")
        print(f"  - {album_count} albums") 
        print(f"  - {artist_count} artists")
        
        # Test search for sample tracks
        pg_cursor.execute("""
            SELECT t.title, a.name as artist 
            FROM tracks t 
            JOIN artists a ON t."artistId" = a.id 
            LIMIT 5
        """)
        sample_tracks = pg_cursor.fetchall()
        print(f"\nSample tracks:")
        for title, artist in sample_tracks:
            print(f"  - {artist}: {title}")
        
    except psycopg2.Error as e:
        print(f"PostgreSQL error: {e}")
        return False
    except Exception as e:
        print(f"Error: {e}")
        return False
    finally:
        if 'pg_conn' in locals():
            pg_conn.close()
        sqlite_conn.close()
    
    return True

if __name__ == "__main__":
    if not os.path.exists(SQLITE_DB):
        print(f"SQLite database not found: {SQLITE_DB}")
        exit(1)
    
    print("Starting migration from SQLite to PostgreSQL...")
    success = migrate_data()
    
    if success:
        print("Migration completed successfully!")
    else:
        print("Migration failed!")
        exit(1)
