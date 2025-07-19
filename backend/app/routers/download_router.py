from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session, aliased
from sqlalchemy import or_
from typing import List
from .. import schemas, models
from ..database import get_db
from ..services import download_service
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    # prefix="/download", 
    tags=["download & library"] 
)

@router.post("/download", response_model=schemas.DownloadResponse)
async def download_music_url_endpoint(
    request: schemas.DownloadRequest, 
    # background_tasks: BackgroundTasks, 
    db: Session = Depends(get_db)
):
    logger.info(f"Received download request for URL: {request.url}")
    result = download_service.download_youtube_url(str(request.url), db, schemas) 
    
    if result["status"] == "error":
        logger.error(f"Download failed for {request.url}: {result.get('message')}")
        raise HTTPException(status_code=500, detail=result.get("message", "Unknown download error"))
    
    logger.info(f"Download successful for {request.url}, tracks processed: {len(result['downloaded_tracks'])}")
    return result

@router.get("/health")
async def health_check():
    return {"status": "ok", "message": "API is working"}

@router.get("/test-tracks")
async def test_tracks():
    """Test endpoint to bypass dependency injection"""
    try:
        from ..database import SessionLocal
        db = SessionLocal()
        try:
            track = db.query(models.Track).filter(models.Track.file_path.isnot(None)).first()
            if track:
                return {
                    "id": track.id,
                    "title": track.title,
                    "file_path": track.file_path,
                    "status": "found"
                }
            else:
                return {"status": "no_tracks"}
        finally:
            db.close()
    except Exception as e:
        return {"status": "error", "message": str(e)}

@router.get("/tracks", response_model=List[schemas.TrackInfo])
async def list_tracks_endpoint(search: str = None, skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    try:
        # Ultra-fast query for auto-play - get first available track without search
        if not search and skip == 0 and limit == 1:
            # Super fast query - get any one track with valid file_path
            track = db.query(models.Track).filter(models.Track.file_path.isnot(None)).first()
            return [track] if track else []
        
        # Regular query for search and pagination
        query = db.query(models.Track)

        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    models.Track.title.ilike(search_term),
                    models.Track.artist.ilike(search_term)  # Use track.artist instead of album.artist_name
                )
            )

        # Simple limit without expensive ordering - just get first available tracks
        tracks = query.offset(skip).limit(limit).all()
        return tracks
    except Exception as e:
        logger.error(f"Error in tracks endpoint: {e}")
        raise HTTPException(status_code=500, detail=f"Database error: {str(e)}")

@router.get("/albums", response_model=List[schemas.Album])
async def list_albums_endpoint(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    albums = db.query(models.Album).order_by(models.Album.title).offset(skip).limit(limit).all()
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
    return album
