#!/usr/bin/env python3
import sqlite3
import os

OLD_PATH = '/Volumes/3ool0ne 2TB/coding tools/youtube-dl/music/'
NEW_PATH = '/Volumes/3ool0ne 2TB/coding tools/9layer/music/'

# Create new music directory if needed
os.makedirs(NEW_PATH, exist_ok=True)

# Update database paths
with sqlite3.connect('music_metadata.db') as conn:
    # Update tracks table
    conn.execute("""
        UPDATE tracks 
        SET file_path = REPLACE(file_path, ?, ?)
    """, (OLD_PATH, NEW_PATH))
    
    # Update albums table
    conn.execute("""
        UPDATE albums 
        SET url = REPLACE(url, 'youtube-dl', '9layer')
        WHERE url LIKE '%youtube-dl%'
    """)
    
    conn.commit()
    print(f"Updated {conn.total_changes} database records")

print("Path update complete!")
