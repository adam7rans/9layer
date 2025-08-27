import logging
import threading
from fastapi import FastAPI, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pathlib import Path

# Imports for routers and services needed by create_app or global instances
from app.routers import download_router, playback_router, websocket_router
from app.services import playback_service # For playback_manager_instance
from app.database import SessionLocal # For playback_manager_instance
from app.config import LOG_LEVEL # Import LOG_LEVEL directly
from app.playback_worker import playback_worker

def create_app():
    app_instance = FastAPI(title="Music Backend API")

    # Add CORS middleware
    app_instance.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    # Setup basic logging configuration for the application
    logging.basicConfig(level=LOG_LEVEL, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s') # Use LOG_LEVEL directly
    logger = logging.getLogger(__name__)

    # Create database tables on startup (for development)
    # For production, consider using Alembic for migrations
    # models.Base.metadata.create_all(bind=engine)

    # Add the download router
    app_instance.include_router(download_router.router, prefix="/api", tags=["download & library"])
    app_instance.include_router(playback_router.router, prefix="/api/player", tags=["playback control"]) # Or just /api and tag differentiate
    app_instance.include_router(websocket_router.router, prefix="/api/ws", tags=["websocket"])
    
    # Add explicit WebSocket endpoint as backup
    @app_instance.websocket("/api/ws")
    async def websocket_endpoint_direct(websocket):
        from app.routers.websocket_router import websocket_endpoint
        await websocket_endpoint(websocket)
    
    # Add explicit CORS headers for all requests (including static files)
    @app_instance.middleware("http")
    async def add_cors_header(request, call_next):
        # Handle preflight requests
        if request.method == "OPTIONS":
            response = Response()
            response.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
            response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            response.headers["Access-Control-Allow-Headers"] = "*"
            response.headers["Access-Control-Max-Age"] = "86400"
            return response
        
        response = await call_next(request)
        
        # Add CORS headers to all responses
        response.headers["Access-Control-Allow-Origin"] = "http://localhost:3000"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
        response.headers["Access-Control-Allow-Headers"] = "*"
        response.headers["Access-Control-Expose-Headers"] = "*"
        
        return response

    # Mount static files for serving audio (after CORS middleware)
    music_dir = Path("/Users/7racker/Documents/9layer/music")
    if music_dir.exists():
        app_instance.mount("/api/audio", StaticFiles(directory=str(music_dir)), name="audio")

    @app_instance.get("/")
    async def root():
        return {"message": "Welcome to the Music Backend API"}
        
    @app_instance.get("/api/health")
    async def health_check():
        return {
            "status": "healthy",
            "websocket_endpoint": "/api/ws"
        }
        
    @app_instance.get("/api/routes")
    async def list_routes():
        routes = []
        for route in app_instance.routes:
            if hasattr(route, 'methods'):
                routes.append({
                    'path': route.path,
                    'methods': list(route.methods),
                    'type': 'HTTP'
                })
            else:
                routes.append({
                    'path': route.path,
                    'type': 'WebSocket'
                })
        return {"routes": routes}

    @app_instance.on_event("startup")
    async def startup_event():
        logger.info("Application startup initiated...") # Add if you want a startup log message
        # DISABLED: Start the playback worker thread (causes hanging issue)
        # try:
        #     worker_thread = threading.Thread(target=playback_worker, daemon=True)
        #     worker_thread.start()
        #     logger.info("Playback worker thread started successfully")
        # except Exception as e:
        #     logger.error(f"Failed to start playback worker: {e}")
        logger.info("Playback worker disabled - using direct audio playback")
        logger.info("Application startup complete.")

    @app_instance.on_event("shutdown")
    async def shutdown_event():
        logger.info("Application shutdown complete.") # Add if you want a shutdown log message

    return app_instance

app = create_app() # Create the main app instance for uvicorn

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app, 
        host="127.0.0.1",  # Try localhost instead of 0.0.0.0
        port=8000,
        log_level="debug",
        access_log=True,
        use_colors=True
    )
