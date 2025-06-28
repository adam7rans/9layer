from sqlalchemy import create_engine, Column, String, Integer, DateTime, ForeignKey, CheckConstraint
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from sqlalchemy.sql import func
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Get database URL from environment or use default
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres@localhost:5432/music_player")

# Create SQLAlchemy engine and session
engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

class Album(Base):
    __tablename__ = 'albums'
    
    id = Column(String, primary_key=True)
    title = Column(String)
    artist = Column(String)
    type = Column(String, CheckConstraint("type IN ('album', 'playlist')"))
    url = Column(String)
    
    # Relationship with tracks
    tracks = relationship("Track", back_populates="album", cascade="all, delete-orphan")

class Track(Base):
    __tablename__ = 'tracks'
    
    id = Column(String, primary_key=True)
    title = Column(String)
    album_id = Column(String, ForeignKey('albums.id', ondelete='CASCADE'))
    position = Column(Integer)
    url = Column(String)
    file_path = Column(String)
    download_date = Column(DateTime(timezone=True), server_default=func.now())
    
    # Relationship with album
    album = relationship("Album", back_populates="tracks")

class Artist(Base):
    __tablename__ = 'artists'
    
    name = Column(String, primary_key=True)
    description = Column(String)

def get_db():
    """Dependency to get DB session"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """Initialize database tables"""
    Base.metadata.create_all(bind=engine)
