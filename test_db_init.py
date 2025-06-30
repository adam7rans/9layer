#!/usr/bin/env python3
"""
Test script to verify database initialization in the same environment as the main app
"""
import os
import sys
from dotenv import load_dotenv
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

def main():
    print("=== Testing Database Initialization ===")
    
    # Load environment variables the same way as the main app
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
        print("❌ Error: DATABASE_URL not found in environment variables")
        return
    
    # Mask password in URL for logging
    safe_db_url = db_url
    if '@' in db_url and ':' in db_url.split('@')[0]:
        protocol_part = db_url.split('://')[0] + '://'
        auth_part = db_url.split('://')[1].split('@')[0]
        if ':' in auth_part:
            user = auth_part.split(':')[0]
            safe_db_url = f"{protocol_part}{user}:***@{db_url.split('@')[1]}"
    
    print(f"Connecting to database: {safe_db_url}")
    
    try:
        # Try to import the models to check for import errors
        try:
            print("\n=== Testing model imports ===")
            from backend.app.models import Base, Track
            print("✅ Successfully imported models")
        except ImportError as e:
            print(f"❌ Error importing models: {e}")
            import traceback
            print("\nImport traceback:")
            print(traceback.format_exc())
            return
        
        # Test database connection
        print("\n=== Testing database connection ===")
        engine = create_engine(
            db_url,
            pool_pre_ping=True,
            pool_recycle=300
        )
        
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
            
            # Count tracks
            result = conn.execute(text("SELECT COUNT(*) FROM tracks;"))
            count = result.scalar()
            print(f"📊 Total tracks in database: {count}")
        
        # Test ORM session
        print("\n=== Testing ORM session ===")
        Session = sessionmaker(bind=engine)
        session = Session()
        
        try:
            # Try to query a track
            track = session.query(Track).first()
            if track:
                print(f"✅ Successfully queried track: {track.title}")
                print(f"    ID: {track.id}")
                print(f"    Path: {track.file_path}")
                print(f"    Likeability: {track.likeability}")
            else:
                print("ℹ️ No tracks found in the database")
                
        except Exception as e:
            print(f"❌ Error querying tracks: {e}")
            import traceback
            print("\nQuery traceback:")
            print(traceback.format_exc())
            
        finally:
            session.close()
            
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        print("\nTraceback:")
        print(traceback.format_exc())

if __name__ == "__main__":
    main()
