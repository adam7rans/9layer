#!/usr/bin/env python3
import psycopg2
from tabulate import tabulate

def verify_data():
    # Connect to PostgreSQL
    conn = psycopg2.connect(
        dbname='music_player',
        user='postgres',
        host='localhost',
        port='5432'
    )
    
    try:
        with conn.cursor() as cur:
            # Count records in each table
            print("\nRecord counts in PostgreSQL:")
            for table in ['albums', 'artists', 'tracks']:
                cur.execute(f'SELECT COUNT(*) FROM {table}')
                count = cur.fetchone()[0]
                print(f"{table}: {count} records")
            
            # Show sample data
            print("\nSample albums:")
            cur.execute('SELECT id, title, artist, type FROM albums LIMIT 5')
            print(tabulate(cur.fetchall(), headers=['ID', 'Title', 'Artist', 'Type'], tablefmt='grid'))
            
            print("\nSample tracks:")
            cur.execute('''
                SELECT t.id, t.title, a.title as album, t.position 
                FROM tracks t 
                JOIN albums a ON t.album_id = a.id 
                LIMIT 5
            ''')
            print(tabulate(cur.fetchall(), headers=['ID', 'Title', 'Album', 'Track #'], tablefmt='grid'))
            
    finally:
        conn.close()

if __name__ == "__main__":
    verify_data()
