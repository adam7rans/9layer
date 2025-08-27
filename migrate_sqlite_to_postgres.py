#!/usr/bin/env python3
"""
Migrate data from SQLite to PostgreSQL for 9layer music player
"""

import sqlite3
import psycopg2
import os
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
        
        # Migrate artists
        print("Migrating artists...")
        sqlite_cursor.execute("SELECT DISTINCT artist FROM albums WHERE artist IS NOT NULL AND artist != ''")
        artists = sqlite_cursor.fetchall()
        
        for (artist_name,) in artists:
            pg_cursor.execute("""
                INSERT INTO artists (name, description) 
                VALUES (%s, %s) 
                ON CONFLICT (name) DO NOTHING
            """, (artist_name, f"Artist: {artist_name}"))
        
        pg_conn.commit()
        print(f"Migrated {len(artists)} artists")
        
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
            pg_cursor.execute("""
                INSERT INTO albums (id, title, artist, type, url) 
                VALUES (%s, %s, %s, %s, %s) 
                ON CONFLICT (id) DO NOTHING
            """, (album_id, title, artist, album_type or 'album', url))
        
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
            
            # Parse download_date
            created_at = datetime.now()
            if download_date:
                try:
                    created_at = datetime.strptime(download_date, '%Y-%m-%d %H:%M:%S')
                except:
                    pass
            
            # Calculate duration (placeholder - would need actual audio file analysis)
            duration = None
            
            pg_cursor.execute("""
                INSERT INTO tracks (id, title, artist, album, album_id, duration, file_path, url, created_at, updated_at) 
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s) 
                ON CONFLICT (id) DO NOTHING
            """, (
                track_id, 
                title, 
                artist or 'Unknown Artist',
                album_title or 'Unknown Album',
                album_id,
                duration,
                file_path,
                url,
                created_at,
                created_at
            ))
            migrated_count += 1
            
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
        
        # Test search for Beastie Boys
        pg_cursor.execute("SELECT title, artist FROM tracks WHERE LOWER(artist) LIKE '%beastie%' LIMIT 5")
        beastie_tracks = pg_cursor.fetchall()
        if beastie_tracks:
            print(f"\nFound Beastie Boys tracks:")
            for title, artist in beastie_tracks:
                print(f"  - {artist}: {title}")
        else:
            print("\nNo Beastie Boys tracks found - checking sample data:")
            pg_cursor.execute("SELECT DISTINCT artist FROM tracks LIMIT 10")
            sample_artists = pg_cursor.fetchall()
            for (artist,) in sample_artists:
                print(f"  - {artist}")
        
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
