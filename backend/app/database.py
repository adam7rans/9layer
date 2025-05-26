from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv
import os

# Load environment variables from .env file
# Assuming .env file is in the backend directory, one level up from app directory
dotenv_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
load_dotenv(dotenv_path)

SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL")

if SQLALCHEMY_DATABASE_URL is None:
    print("Warning: DATABASE_URL environment variable not set. Using default SQLite for local testing.")
    # Fallback to SQLite if DATABASE_URL is not set (for local dev without Postgres)
    # Ensure this part is suitable for your project's goals, often it's better to require Postgres
    SQLALCHEMY_DATABASE_URL = "sqlite:///./music_local_dev.db" 
    engine = create_engine(
        SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False} # Needed for SQLite
    )
else:
    engine = create_engine(SQLALCHEMY_DATABASE_URL)

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
