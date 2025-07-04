import logging
import sys
from pathlib import Path

# Add the project root to the Python path
# This allows the script to import modules from the `app` directory
project_root = Path(__file__).resolve().parent.parent
sys.path.append(str(project_root))

from sqlalchemy.orm import Session
from app.database import SessionLocal
from app.models import Album, Track
from app.config import MUSIC_DOWNLOAD_DIR

# Set up basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

def backfill_artist_names(db: Session):
    """
    Finds albums with no artist name and backfills it by inspecting the file path of a related track.
    """
    logging.info("Starting artist name backfill process...")
    
    albums_to_update = db.query(Album).filter((Album.artist_name == None) | (Album.artist_name == '')).all()
    
    if not albums_to_update:
        logging.info("No albums found with missing artist names. Database is up to date.")
        return

    logging.info(f"Found {len(albums_to_update)} albums to update.")
    updated_count = 0

    for album in albums_to_update:
        track = db.query(Track).filter(Track.album_id == album.id).first()
        
        if not track or not track.file_path:
            logging.warning(f"Album '{album.title}' (ID: {album.id}) has no tracks or track has no file path. Skipping.")
            continue

        # Correct the file path if it points to the old volume name
        corrected_file_path = track.file_path
        if "3ool0ne 2TB" in corrected_file_path:
            corrected_file_path = corrected_file_path.replace("/Volumes/3ool0ne 2TB/", "/Volumes/2TB/")
            
        try:
            # Use the corrected path for processing
            relative_path = Path(corrected_file_path).relative_to(MUSIC_DOWNLOAD_DIR)
            
            if relative_path.parts:
                artist_name = relative_path.parts[0]
                album.artist_name = artist_name
                logging.info(f"Updating album '{album.title}' with artist: {artist_name}")
                updated_count += 1
            else:
                logging.warning(f"Could not determine artist from path for track in album '{album.title}'. Path: {track.file_path}")

        except ValueError as e:
            logging.error(f"Error processing path for track in album '{album.title}'. Path: {track.file_path}. Error: {e}")
            continue

    if updated_count > 0:
        db.commit()
        logging.info(f"Successfully updated {updated_count} albums.")
    else:
        logging.info("No albums were updated in this run.")
        db.rollback()

def main():
    """
    Main function to set up DB session and run the backfill process.
    """
    db = SessionLocal()
    try:
        backfill_artist_names(db)
    finally:
        db.close()

if __name__ == "__main__":
    main()
