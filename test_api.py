#!/usr/bin/env python3
"""
Test script to diagnose API issues.
"""

import sys
from pathlib import Path
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

# Add the project root to the path
sys.path.insert(0, str(Path(__file__).parent))

# Direct database connection
from sqlalchemy import create_engine, Column, Integer, String, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import sessionmaker, relationship, declarative_base
from sqlalchemy.sql import func
import enum

# Database setup
DATABASE_URL = "postgresql://7racker@localhost:5432/music_player"
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class AlbumType(enum.Enum):
    album = "album"
    playlist = "playlist"

class Artist(Base):
    __tablename__ = "artists"
    name = Column(String, primary_key=True, index=True)
    description = Column(String, nullable=True)

class Album(Base):
    __tablename__ = "albums"
    id = Column(String, primary_key=True, index=True)
    title = Column(String, index=True)
    artist_name = Column(String, nullable=True, index=True)
    type = Column(SAEnum(AlbumType), nullable=False)
    url = Column(String, nullable=True)
    tracks = relationship("Track", back_populates="album")

class Track(Base):
    __tablename__ = "tracks"
    id = Column(String, primary_key=True, index=True)
    title = Column(String, index=True)
    album_id = Column(String, ForeignKey("albums.id"), nullable=True)
    position = Column(Integer, nullable=True)
    url = Column(String, nullable=True)
    file_path = Column(String, unique=True, nullable=False)
    download_date = Column(DateTime(timezone=True), server_default=func.now())
    likeability = Column(Integer, default=0, nullable=False)
    album = relationship("Album", back_populates="tracks")

def test_database_direct():
    """Test database connection and queries directly."""
    print("Testing database connection...")
    
    db = SessionLocal()
    try:
        # Test basic query
        tracks = db.query(Track).limit(5).all()
        print(f"Found {len(tracks)} tracks")
        
        for track in tracks:
            print(f"- {track.title} by {track.album.artist_name if track.album else 'Unknown'}")
        
        # Test search query
        search_term = "%helmet%"
        search_tracks = db.query(Track).join(Album).filter(
            Album.artist_name.ilike(search_term)
        ).limit(5).all()
        
        print(f"\nFound {len(search_tracks)} tracks matching 'helmet':")
        for track in search_tracks:
            print(f"- {track.title} by {track.album.artist_name} ({track.album.title})")
    
    except Exception as e:
        print(f"Database error: {e}")
    finally:
        db.close()

def test_api_endpoint():
    """Test the API endpoint using requests."""
    import requests
    
    print("\nTesting API endpoint...")
    
    try:
        # Test basic endpoint
        response = requests.get("http://localhost:8000/api/tracks?limit=5")
        print(f"Status code: {response.status_code}")
        print(f"Response headers: {dict(response.headers)}")
        
        if response.status_code == 200:
            try:
                data = response.json()
                print(f"Response data: {data}")
            except Exception as e:
                print(f"JSON parsing error: {e}")
                print(f"Raw response: {response.text}")
        else:
            print(f"Error response: {response.text}")
    
    except Exception as e:
        print(f"API request error: {e}")

def test_pydantic_serialization():
    """Test Pydantic model serialization."""
    from backend.app.schemas import TrackInfo
    
    print("\nTesting Pydantic serialization...")
    
    db = SessionLocal()
    try:
        # Get a track with album
        track = db.query(Track).join(Album).first()
        if track:
            print(f"Track object: {track}")
            print(f"Album object: {track.album}")
            
            # Try to serialize
            try:
                track_info = TrackInfo.model_validate(track)
                print(f"Serialized TrackInfo: {track_info}")
            except Exception as e:
                print(f"Serialization error: {e}")
        
    except Exception as e:
        print(f"Error: {e}")
    finally:
        db.close()

if __name__ == "__main__":
    test_database_direct()
    test_api_endpoint()
    test_pydantic_serialization()