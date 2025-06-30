#!/usr/bin/env python3
"""
Script to check if the 'likeability' column exists in the 'tracks' table,
and add it if it doesn't exist.
"""
import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.exc import ProgrammingError
from dotenv import load_dotenv

def main():
    # Load environment variables
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dotenv_path = os.path.join(script_dir, '.env')
    load_dotenv(dotenv_path)
    
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not found in .env file")
        sys.exit(1)
    
    print(f"Connecting to database: {db_url}")
    
    try:
        # Create engine
        engine = create_engine(db_url)
        
        with engine.connect() as conn:
            # Check if likeability column exists
            check_sql = """
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='tracks' AND column_name='likeability';
            """
            result = conn.execute(text(check_sql)).fetchone()
            
            if result:
                print("Column 'likeability' already exists in 'tracks' table")
            else:
                # Add the likeability column
                print("Adding 'likeability' column to 'tracks' table...")
                alter_sql = """
                ALTER TABLE tracks 
                ADD COLUMN likeability INTEGER NOT NULL DEFAULT 0;
                """
                conn.execute(text(alter_sql))
                conn.commit()
                print("Successfully added 'likeability' column to 'tracks' table")
            
            # Verify the column exists and show some sample data
            try:
                sample_sql = """
                SELECT id, title, likeability 
                FROM tracks 
                WHERE likeability != 0 
                LIMIT 5;
                """
                sample_data = conn.execute(text(sample_sql)).fetchall()
                
                if sample_data:
                    print("\nSample tracks with non-zero likeability:")
                    for track in sample_data:
                        print(f"- {track.title}: {track.likeability}")
                else:
                    print("\nNo tracks with non-zero likeability found.")
                    print("Use '[' and ']' keys in the player to adjust likeability.")
                    
            except Exception as e:
                print(f"\nWarning: Could not fetch sample data: {e}")
                
    except Exception as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
