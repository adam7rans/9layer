#!/usr/bin/env python3
"""
Test script to check database connection and track entries
"""
import os
import sys
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

def main():
    print("=== Database Connection Test ===")
    
    # Load environment variables
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    dotenv_path = os.path.join(project_root, '.env')
    
    if not os.path.exists(dotenv_path):
        dotenv_path = os.path.join(script_dir, '.env')
    
    print(f"Loading environment from: {dotenv_path}")
    load_dotenv(dotenv_path, override=True)
    
    # Get database URL
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("Error: DATABASE_URL not found in .env file")
        return
    
    # Mask password in the URL for logging
    safe_db_url = db_url
    if '@' in db_url and ':' in db_url.split('@')[0]:
        protocol_part = db_url.split('://')[0] + '://'
        auth_part = db_url.split('://')[1].split('@')[0]
        if ':' in auth_part:
            user = auth_part.split(':')[0]
            safe_db_url = f"{protocol_part}{user}:***@{db_url.split('@')[1]}"
    
    print(f"Connecting to database: {safe_db_url}")
    
    try:
        # Create engine with connection pooling
        engine = create_engine(
            db_url,
            pool_pre_ping=True,
            pool_recycle=300
        )
        
        # Test connection
        with engine.connect() as conn:
            print("✅ Successfully connected to database")
            
            # Check if tracks table exists
            result = conn.execute(text("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_name = 'tracks'
                );
            """))
            
            if not result.scalar():
                print("❌ 'tracks' table does not exist in the database")
                return
            
            print("✅ 'tracks' table exists")
            
            # Check if likeability column exists
            result = conn.execute(text("""
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name='tracks' AND column_name='likeability';
            
            """))
            
            if not result.fetchone():
                print("❌ 'likeability' column not found in 'tracks' table")
            else:
                print("✅ 'likeability' column exists in 'tracks' table")
            
            # Count number of tracks
            result = conn.execute(text("SELECT COUNT(*) FROM tracks;"))
            count = result.scalar()
            print(f"📊 Total tracks in database: {count}")
            
            # Show first few tracks
            print("\nSample of tracks in database:")
            result = conn.execute(text("""
                SELECT id, title, file_path, likeability 
                FROM tracks 
                LIMIT 5;
            """))
            
            for row in result:
                print(f"- ID: {row[0]}, Title: {row[1]}")
                print(f"  Path: {row[2]}")
                print(f"  Likeability: {row[3]}")
                
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        print("\nStack trace:")
        print(traceback.format_exc())

if __name__ == "__main__":
    main()
