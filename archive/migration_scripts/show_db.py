#!/usr/bin/env python3
import sqlite3
from tabulate import tabulate

DB_PATH = 'music_metadata.db'

def display_table(conn, table_name):
    print(f"\n{table_name.upper()}:")
    cursor = conn.execute(f"SELECT * FROM {table_name} LIMIT 50")
    headers = [desc[0] for desc in cursor.description]
    print(tabulate(cursor.fetchall(), headers=headers, tablefmt='grid'))

if __name__ == "__main__":
    try:
        with sqlite3.connect(DB_PATH) as conn:
            # Show all tables
            tables = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
            
            for table in tables:
                display_table(conn, table[0])
                
            # Show playlist track counts
            print("\nPLAYLIST TRACK COUNTS:")
            cursor = conn.execute("""
                SELECT a.id, a.title, COUNT(t.id) as tracks
                FROM albums a
                LEFT JOIN tracks t ON a.id = t.album_id
                WHERE a.type = 'playlist'
                GROUP BY a.id
                ORDER BY a.title
            """)
            print(tabulate(cursor.fetchall(), 
                         headers=['ID', 'Playlist', 'Tracks'], 
                         tablefmt='grid'))
            
    except Exception as e:
        print(f"Error reading database: {e}")
