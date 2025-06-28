#!/usr/bin/env python3
import sqlite3
import psycopg2
from psycopg2.extras import execute_batch
import os
from dotenv import load_dotenv
from tqdm import tqdm

# Load environment variables
load_dotenv()

# SQLite connection
sqlite_conn = sqlite3.connect('music_metadata.db')
sqlite_conn.row_factory = sqlite3.Row  # Access columns by name

# PostgreSQL connection
pg_conn = psycopg2.connect(
    dbname='music_player',
    user='music_user',
    password='music_password',
    host='localhost',
    port='5432'
)

def migrate_table(table_name, batch_size=1000):
    """Migrate data from SQLite to PostgreSQL for a given table."""
    with sqlite_conn:
        sqlite_cur = sqlite_conn.cursor()
        
        # Get column names
        sqlite_cur.execute(f'SELECT * FROM {table_name} LIMIT 0')
        columns = [desc[0] for desc in sqlite_cur.description]
        
        # Get total count for progress bar
        sqlite_cur.execute(f'SELECT COUNT(*) FROM {table_name}')
        total = sqlite_cur.fetchone()[0]
        
        if total == 0:
            print(f"No data to migrate for table {table_name}")
            return
        
        print(f"\nMigrating {total} rows from {table_name}...")
        
        # Prepare placeholders and query
        placeholders = ', '.join(['%s'] * len(columns))
        cols = ', '.join([f'\"{col}\"' for col in columns])  # Quote column names
        insert_query = f'INSERT INTO {table_name} ({cols}) VALUES ({placeholders}) ON CONFLICT DO NOTHING'
        
        # Process in batches
        offset = 0
        with pg_conn.cursor() as pg_cur:
            with tqdm(total=total, unit='rows') as pbar:
                while True:
                    sqlite_cur.execute(f'SELECT * FROM {table_name} LIMIT ? OFFSET ?', (batch_size, offset))
                    batch = sqlite_cur.fetchall()
                    
                    if not batch:
                        break
                    
                    # Convert sqlite.Row to tuple for psycopg2
                    batch_data = [tuple(row) for row in batch]
                    
                    # Insert batch into PostgreSQL
                    execute_batch(pg_cur, insert_query, batch_data)
                    pg_conn.commit()
                    
                    offset += len(batch)
                    pbar.update(len(batch))
        
        print(f"Successfully migrated {table_name}")

def main():
    try:
        # Disable foreign key checks temporarily for faster imports
        with pg_conn.cursor() as cur:
            cur.execute('SET session_replication_role = \'replica\';')
        
        # Migrate tables in the correct order to respect foreign keys
        for table in ['albums', 'artists', 'tracks']:
            migrate_table(table)
        
        # Re-enable foreign key checks
        with pg_conn.cursor() as cur:
            cur.execute('SET session_replication_role = \'origin\';')
            pg_conn.commit()
        
        print("\nMigration completed successfully!")
        
    except Exception as e:
        print(f"Error during migration: {e}")
        pg_conn.rollback()
    finally:
        sqlite_conn.close()
        pg_conn.close()

if __name__ == "__main__":
    main()
