from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func # For server_default=func.now()
from .database import Base
import enum

class AlbumType(enum.Enum):
    album = "album"
    playlist = "playlist"

class Artist(Base):
    __tablename__ = "artists"

    name = Column(String, primary_key=True, index=True)
    description = Column(String, nullable=True)

    # Relationship: An artist can have multiple albums (assuming artist is linked to album)
    # albums = relationship("Album", back_populates="artist_detail")
    # tracks = relationship("Track", secondary="track_artists", back_populates="artists") # If many-to-many for tracks

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)

class Album(Base):
    __tablename__ = "albums"

    id = Column(String, primary_key=True, index=True) # YouTube playlist/album ID or generated
    title = Column(String, index=True)
    # If using a direct relationship to Artist table:
    # artist_name = Column(String, ForeignKey("artists.name"), nullable=True)
    # artist_detail = relationship("Artist", back_populates="albums")
    # Or, if storing artist name directly as in downloader.py:
    artist_name = Column(String, nullable=True, index=True) # Name of the artist from metadata
    type = Column(SAEnum(AlbumType), nullable=False)
    url = Column(String, nullable=True) # URL of the album/playlist on YouTube

    tracks = relationship("Track", back_populates="album")

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)

class Track(Base):
    __tablename__ = "tracks"

    id = Column(String, primary_key=True, index=True) # YouTube video ID
    title = Column(String, index=True)
    album_id = Column(String, ForeignKey("albums.id"), nullable=True) # Can be nullable if track is not part of an album/playlist
    position = Column(Integer, nullable=True) # e.g., track number in album/playlist
    url = Column(String, nullable=True) # URL of the track on YouTube
    file_path = Column(String, unique=True, nullable=False) # Path to the downloaded file
    download_date = Column(DateTime(timezone=True), server_default=func.now())
    likeability = Column(Integer, default=0, nullable=False)  # Tracks user preference, default is neutral (0)
    # Add other fields as needed, e.g., duration, genre, etc.

    album = relationship("Album", back_populates="tracks")
    # If many-to-many relationship with artists:
    # artists = relationship("Artist", secondary="track_artists", back_populates="tracks")

    def __init__(self, **kwargs):
        for key, value in kwargs.items():
            setattr(self, key, value)

# If you need a many-to-many relationship between tracks and artists (e.g., collaborations)
# you would define an association table here:
# from sqlalchemy import Table
# track_artists = Table('track_artists', Base.metadata,
#    Column('track_id', String, ForeignKey('tracks.id'), primary_key=True),
#    Column('artist_name', String, ForeignKey('artists.name'), primary_key=True)
# )
