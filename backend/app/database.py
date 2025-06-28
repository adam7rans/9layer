from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os
import sys

# Load environment variables from .env file
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
load_dotenv(dotenv_path)

# Require DATABASE_URL to be set
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")
if not SQLALCHEMY_DATABASE_URL:
    sys.exit("Error: DATABASE_URL environment variable not set. Please configure PostgreSQL connection in .env file")

# Create PostgreSQL engine with connection pooling
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    pool_pre_ping=True,  # Verify connections before using them
    pool_size=5,         # Maintain a pool of up to 5 connections
    max_overflow=10,      # Allow up to 10 connections to be created beyond pool_size
    pool_timeout=30,      # Wait up to 30 seconds for a connection
    pool_recycle=1800     # Recycle connections after 30 minutes
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Dependency to get DB session
def get_db():
    print("DEBUG [ORIGINAL get_db]: Called.") # Diagnostic print
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
