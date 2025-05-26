from pydantic import BaseModel, HttpUrl, Field, validator
from typing import List, Optional
from datetime import datetime
from .models import AlbumType # Import the enum
from pathlib import Path

class ArtistBase(BaseModel):
    name: str
    description: Optional[str] = None

class ArtistCreate(ArtistBase):
    pass

class Artist(ArtistBase):
    class Config:
        orm_mode = True

# Forward references for circular dependencies if Track includes Album and Album includes Track
# However, for basic list displays, it's often better to have simplified models.

class TrackBase(BaseModel):
    id: str
    title: str
    album_id: Optional[str] = None
    position: Optional[int] = None
    url: Optional[HttpUrl] = None # Keep as HttpUrl for stricter validation if desired
    file_path: str # Should be a string path

class TrackCreate(TrackBase):
    pass

# Pydantic model for representing a Track, used in responses
class Track(TrackBase):
    download_date: datetime
    # To avoid circular dependency with Album including List[Track], 
    # we might omit 'album' here or use a simplified AlbumInTrack schema
    # For now, let's try with Optional[Album] and see if Pydantic handles it with from_orm
    # album: Optional['Album'] # This creates a circular dependency if Album also lists Tracks fully

    class Config:
        orm_mode = True

class AlbumBase(BaseModel):
    id: str
    title: str
    artist_name: Optional[str] = None
    type: AlbumType
    url: Optional[HttpUrl] = None # Keep as HttpUrl

class AlbumCreate(AlbumBase):
    pass

class Album(AlbumBase):
    # If you want to include tracks when fetching an album:
    tracks: List[Track] = [] # This will be populated by SQLAlchemy relationship if accessed
    
    class Config:
        orm_mode = True
        
# Update Track to resolve potential circular dependency by using a forward reference string for Album
# This is Pydantic v1 style. For Pydantic v2, it's usually handled more automatically.
# Pydantic v2 handles forward references more smoothly with `model_rebuild()` or by default in many cases.
# For Pydantic v1, explicit `update_forward_refs()` might be needed if issues arise.
# Track.update_forward_refs() 
# Album.update_forward_refs()
# Let's assume from_orm handles it for now, as it often does with careful structuring.

class PlayTrackRequest(BaseModel):
    track_id: str

class PlaybackStatusResponse(BaseModel):
    track_id: Optional[str] = None
    path: Optional[str] = None
    duration: int = 0
    elapsed_time: float = 0.0
    is_playing: bool = False
    is_paused: bool = False
    volume: int = 0
    random_mode: bool = False
    auto_play_next: bool = False
    play_history_size: int = 0
    # Add a message field for general status updates from playback manager
    message: Optional[str] = None 
    status: Optional[str] = None # e.g. "playing", "paused", "stopped", "error"


class VolumeRequest(BaseModel):
    level: int = Field(..., ge=0, le=100) # Volume level between 0 and 100

class PlaybackActionResponse(BaseModel):
    status: str # e.g., "playing", "paused", "stopped", "error", "volume_set"
    message: Optional[str] = None
    track_id: Optional[str] = None
    # Add any other relevant fields from playback_manager responses
    duration: Optional[int] = None
    elapsed_time: Optional[float] = None
    level: Optional[int] = None # For volume response


class DownloadRequest(BaseModel):
    url: str # Keeping as str, with custom validation

    @validator('url')
    def url_must_be_valid_http_or_https(cls, v):
        if not v.startswith(('http://', 'https://')):
            raise ValueError('URL must start with http:// or https://')
        # Add more robust URL validation if needed, e.g., using a regex or a library
        return v


class DownloadResponse(BaseModel):
    status: str
    message: Optional[str] = None
    downloaded_tracks: List[Track] = []
