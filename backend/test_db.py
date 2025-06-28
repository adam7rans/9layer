#!/usr/bin/env python3
import sys
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Add the parent directory to the path so we can import app modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.database import SQLALCHEMY_DATABASE_URL, engine

def test_database_connection():
    """Test the database connection and print some stats."""
    try:
        # Test the connection
        with engine.connect() as connection:
            print("✅ Successfully connected to the database!")
            
            # Get database version
            result = connection.execute(text("SELECT version()"))
            print(f"\nDatabase version: {result.scalar()}")
            
            # Get table counts
            tables = ['albums', 'artists', 'tracks']
            for table in tables:
                result = connection.execute(text(f"SELECT COUNT(*) FROM {table}"))
                count = result.scalar()
                print(f"{table}: {count} records")
            
            # Show sample data
            print("\nSample data:")
            result = connection.execute(text("""
                SELECT a.title as album, a.artist, t.title as track, t.position 
                FROM tracks t 
                JOIN albums a ON t.album_id = a.id 
                ORDER BY random() 
                LIMIT 5
            "))
            
            print("\nRandom sample of tracks:")
            for row in result:
                print(f"- {row.artist} - {row.album} - {row.position}. {row.track}")
                
    except Exception as e:
        print(f"❌ Error connecting to the database: {e}")
        return False
    
    return True

if __name__ == "__main__":
    print("Testing database connection...")
    if test_database_connection():
        print("\n✅ Database connection test passed!")
    else:
        print("\n❌ Database connection test failed!")
