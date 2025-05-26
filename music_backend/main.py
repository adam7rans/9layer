from fastapi import FastAPI

app = FastAPI(title="Music Backend API")

@app.get("/")
async def root():
    return {"message": "Welcome to the Music Backend API"}

# Placeholder for future routers
# from app.routers import download_router, playback_router
# app.include_router(download_router.router, prefix="/api")
# app.include_router(playback_router.router, prefix="/api")

# Import database and models for table creation
from app import models
from app.database import engine, Base
from app.routers import download_router, playback_router # Add playback_router
import logging

# Setup basic logging configuration for the application
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


# Create database tables on startup (for development)
# For production, consider using Alembic for migrations
Base.metadata.create_all(bind=engine)

# Add the download router
app.include_router(download_router.router, prefix="/api", tags=["download & library"])
app.include_router(playback_router.router, prefix="/api/player", tags=["playback control"]) # Or just /api and tag differentiate

if __name__ == "__main__":
    import uvicorn
    logger.info("Application startup initiated...") # Add if you want a startup log message
    uvicorn.run(app, host="0.0.0.0", port=8000)
    logger.info("Application startup complete.") # Add if you want a startup log message
