from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List
from app import schemas, models # Ensure models is imported if you query them directly here
from app.database import get_db
from app.services import download_service 
import logging


logger = logging.getLogger(__name__)
# logging.basicConfig(level=logging.INFO) # BasicConfig should be called once, preferably in main.py


router = APIRouter(
    # prefix="/download", # Prefixing at the app level (main.py) is often cleaner
    tags=["download & library"] # Combined tag
)

@router.post("/download", response_model=schemas.DownloadResponse)
async def download_music_url_endpoint(
    request: schemas.DownloadRequest, 
    # background_tasks: BackgroundTasks, # For running download in background - simplified for now
    db: Session = Depends(get_db)
):
    # Using background tasks for downloads is better for UX, but makes returning
    # the direct result of the download tricky.
    # For now, let's run it synchronously for simplicity and to return results.
    # If you switch to background_tasks.add_task(download_service.download_youtube_url, str(request.url), db, schemas),
    # the response would be immediate, e.g., {"status": "pending", "message": "Download started."}
    
    logger.info(f"Received download request for URL: {request.url}")
    # Pass schemas to the service function, as it's needed for from_orm
    result = download_service.download_youtube_url(str(request.url), db, schemas) 
    
    if result["status"] == "error":
        logger.error(f"Download failed for {request.url}: {result.get('message')}")
        raise HTTPException(status_code=500, detail=result.get("message", "Unknown download error"))
    
    logger.info(f"Download successful for {request.url}, tracks processed: {len(result['downloaded_tracks'])}")
    return result

@router.get("/tracks", response_model=List[schemas.Track])
async def list_tracks_endpoint(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    tracks = db.query(models.Track).order_by(models.Track.download_date.desc()).offset(skip).limit(limit).all()
    return tracks

@router.get("/albums", response_model=List[schemas.Album])
async def list_albums_endpoint(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    albums = db.query(models.Album).order_by(models.Album.title).offset(skip).limit(limit).all()
    # To include tracks in each album, SQLAlchemy's relationship loading should handle it
    # if accessed by Pydantic's from_orm. Default is lazy loading.
    # If performance is an issue, use joinedload or selectinload.
    return albums

@router.get("/tracks/{track_id}", response_model=schemas.Track)
async def get_track_endpoint(track_id: str, db: Session = Depends(get_db)):
    track = db.query(models.Track).filter(models.Track.id == track_id).first()
    if not track:
        raise HTTPException(status_code=404, detail="Track not found")
    return track

@router.get("/albums/{album_id}", response_model=schemas.Album)
async def get_album_endpoint(album_id: str, db: Session = Depends(get_db)):
    album = db.query(models.Album).filter(models.Album.id == album_id).first()
    if not album:
        raise HTTPException(status_code=404, detail="Album not found")
    # Example of eager loading tracks for this specific album endpoint
    # from sqlalchemy.orm import selectinload
    # album = db.query(models.Album).options(selectinload(models.Album.tracks)).filter(models.Album.id == album_id).first()
    return album
