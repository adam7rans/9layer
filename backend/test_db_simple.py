#!/usr/bin/env python3
import sys
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Database connection string
DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres@localhost:5432/music_player')

def test_connection():
    try:
        # Create engine
        engine = create_engine(DATABASE_URL)
        
        # Test connection
        with engine.connect() as conn:
            print("✅ Successfully connected to PostgreSQL!")
            
            # Get database version
            result = conn.execute(text("SELECT version()"))
            print(f"\nPostgreSQL version: {result.scalar()}")
            
            # Get table counts
            print("\nRecord counts:")
            for table in ['albums', 'artists', 'tracks']:
                result = conn.execute(text(f"SELECT COUNT(*) FROM {table}"))
                print(f"- {table}: {result.scalar():,} records")
            
            # Get sample data
            print("\nSample tracks:")
            result = conn.execute(text("""
                SELECT a.artist, a.title as album, t.title as track, t.position 
                FROM tracks t 
                JOIN albums a ON t.album_id = a.id 
                ORDER BY random() 
                LIMIT 5
            "))
            
            for row in result:
                print(f"- {row.artist} - {row.album} - {row.position}. {row.track}")
            
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
