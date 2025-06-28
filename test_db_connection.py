#!/usr/bin/env python3
import os
from dotenv import load_dotenv
from sqlalchemy import create_engine, text

# Load environment variables
load_dotenv()

# Get database URL from environment or use default
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres@localhost:5432/music_player")

try:
    # Create SQLAlchemy engine
    engine = create_engine(DATABASE_URL)
    
    # Test connection
    with engine.connect() as conn:
        print("✅ Successfully connected to PostgreSQL database!")
        
        # Check if tables exist
        result = conn.execute(text(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
        ))
        tables = [row[0] for row in result]
        print("\nTables in database:", ", ".join(tables) or "No tables found")
        
        # Check if our tables exist
        for table in ['albums', 'tracks', 'artists']:
            exists = table in tables
            print(f"- {table}: {'✅ Found' if exists else '❌ Not found'}")
        
        # Count records in each table
        print("\nRecord counts:")
        for table in ['albums', 'tracks', 'artists']:
            if table in tables:
                count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).scalar()
                print(f"- {table}: {count} records")
            
except Exception as e:
    print(f"❌ Error connecting to database: {e}")
    raise
