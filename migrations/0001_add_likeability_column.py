"""
Migration script to add 'likeability' column to 'tracks' table.
Run with: python -m migrations.0001_add_likeability_column
"""
import os
import sys
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Add parent directory to path to import database models
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from backend.app.database import SQLALCHEMY_DATABASE_URL

def run_migration():
    print("Starting migration: Adding 'likeability' column to 'tracks' table")
    
    # Create database engine
    engine = create_engine(SQLALCHEMY_DATABASE_URL)
    
    # Check if the column already exists
    with engine.connect() as connection:
        # Check if column exists
        result = connection.execute(
            text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='tracks' AND column_name='likeability'
            """)
        ).fetchone()
        
        if result:
            print("Column 'likeability' already exists in 'tracks' table")
            return
            
        # Add the column if it doesn't exist
        print("Adding 'likeability' column to 'tracks' table...")
        connection.execute(
            text("""
            ALTER TABLE tracks 
            ADD COLUMN likeability INTEGER NOT NULL DEFAULT 0
            """)
        )
        connection.commit()
        
    print("Migration completed successfully")

if __name__ == "__main__":
    run_migration()
