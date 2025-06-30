#!/usr/bin/env python3
"""
Test script to verify the likeability feature
"""
import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

def test_likeability():
    # Load environment variables
    script_dir = os.path.dirname(os.path.abspath(__file__))
    dotenv_path = os.path.join(script_dir, '.env')
    load_dotenv(dotenv_path)
    
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not found in .env file")
        return False
    
    print(f"Connecting to database: {db_url}")
    
    try:
        # Create engine with connection pooling
        engine = create_engine(
            db_url,
            pool_pre_ping=True,
            pool_recycle=300
        )
        
        # Create session factory
        Session = sessionmaker(bind=engine)
        
        # Test connection
        with Session() as session:
            # Check if tracks table exists
            result = session.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'tracks'
                );
            """))
            table_exists = result.scalar()
            
            if not table_exists:
                print("Error: 'tracks' table does not exist in the database")
                return False
                
            # Check if likeability column exists
            result = session.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='tracks' AND column_name='likeability';
            """))
            
            if not result.fetchone():
                print("Error: 'likeability' column does not exist in 'tracks' table")
                return False
                
            # Get a sample track
            result = session.execute(text("""
                SELECT id, title, file_path, likeability 
                FROM tracks 
                LIMIT 1;
            """))
            
            track = result.fetchone()
            
            if not track:
                print("No tracks found in the database. Please add some tracks first.")
                return False
                
            print("\nSample track found in database:")
            print(f"ID: {track[0]}")
            print(f"Title: {track[1]}")
            print(f"File: {track[2]}")
            print(f"Current likeability: {track[3]}")
            
            # Test updating likeability
            new_likeability = 1 if (track[3] or 0) <= 0 else -1  # Toggle between 1 and -1
            
            update_result = session.execute(
                text("""
                    UPDATE tracks 
                    SET likeability = :likeability 
                    WHERE id = :id
                    RETURNING id, likeability;
                """),
                {"likeability": new_likeability, "id": track[0]}
            )
            
            updated = update_result.fetchone()
            session.commit()
            
            if updated:
                print(f"\nSuccessfully updated likeability to: {updated[1]}")
                return True
            else:
                print("\nFailed to update likeability")
                return False
                
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        print("\nStack trace:")
        print(traceback.format_exc())
        return False

if __name__ == "__main__":
    print("Testing likeability feature...\n")
    success = test_likeability()
    
    if success:
        print("\n✅ Likeability feature is working correctly!")
    else:
        print("\n❌ Likeability feature test failed. Please check the error messages above.")
