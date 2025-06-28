#!/usr/bin/env python3
import psycopg2
from dotenv import load_dotenv
import os

def test_connection():
    try:
        # Load environment variables
        load_dotenv()
        
        # Get database URL from environment or use default
        db_url = os.getenv('DATABASE_URL', 'postgresql://postgres@localhost:5432/music_player')
        
        # Connect to PostgreSQL
        conn = psycopg2.connect(db_url)
        cur = conn.cursor()
        
        print("✅ Successfully connected to PostgreSQL!")
        
        # Get database version
        cur.execute("SELECT version()")
        print(f"\nPostgreSQL version: {cur.fetchone()[0]}")
        
        # Get table counts
        print("\nRecord counts:")
        for table in ['albums', 'artists', 'tracks']:
            cur.execute(f"SELECT COUNT(*) FROM {table}")
            print(f"- {table}: {cur.fetchone()[0]:,} records")
        
        # Get sample data
        print("\nSample tracks:")
        cur.execute("""
            SELECT a.artist, a.title as album, t.title as track, t.position 
            FROM tracks t 
            JOIN albums a ON t.album_id = a.id 
            ORDER BY random() 
            LIMIT 5
        """)
        
        for row in cur.fetchall():
            print(f"- {row[0]} - {row[1]} - {row[3]}. {row[2]}")
        
        cur.close()
        conn.close()
        return True
        
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == "__main__":
    print("Testing PostgreSQL connection...")
    if test_connection():
        print("\n✅ Database connection test passed!")
    else:
        print("\n❌ Database connection test failed!")
