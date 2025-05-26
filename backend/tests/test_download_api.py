from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, ANY # For mocking service calls
from backend.app import schemas # Changed from 'from app import schemas'
from backend.app import models # Changed from 'from app import models'
from datetime import datetime # For datetime objects
from fastapi import BackgroundTasks # Import BackgroundTasks
from sqlalchemy.orm import Session # Import Session for type hinting
from .conftest import diagnostic_log # Import the logger

# client fixture is defined in conftest.py
# db_session fixture is defined in conftest.py

# Import schemas module to pass to the service call if needed by the actual function signature
from backend.app import schemas as app_schemas # Renamed to avoid conflict

# Test data
TEST_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"

@patch('backend.app.routers.download_router.download_service.download_youtube_url') # Corrected patch target
def test_download_url(mock_download_func, client: TestClient, db_session: Session):
    # Mock the service method to return a dictionary structure similar to what the service returns
    # The actual download_youtube_url returns a dictionary like:
    # {'status': 'success', 'downloaded_tracks': [TrackSchema_instance1, ...], 'message': '...'} or
    # {'status': 'error', 'message': '...'} 
    # The endpoint then wraps this in DownloadResponse schema.

    # We need to mock the return of download_youtube_url, which is a dictionary
    # that will then be processed by the endpoint and validated against schemas.DownloadResponse.
    # The endpoint expects 'downloaded_tracks' in the dict to be a list of Track *models* if it's to be converted by from_orm.
    # Or, if the service itself returns Pydantic schemas, that's fine too.
    # Let's assume the service returns data that can be serialized into schemas.Track.
    mock_service_return_value = {
        "status": "success",
        "downloaded_tracks": [
            models.Track(id="track_dl_1", title="Test Downloaded Song", file_path="/fake/path/downloaded.mp3", url=TEST_URL, download_date=datetime.now())
        ],
        "message": "Download completed successfully."
    }
    mock_download_func.return_value = mock_service_return_value

    response = client.post("/api/download", json={"url": TEST_URL}) # Endpoint is /api/download

    assert response.status_code == 200
    data = response.json() # This should be schemas.DownloadResponse
    
    assert data["status"] == "success"
    assert len(data["downloaded_tracks"]) == 1
    assert data["downloaded_tracks"][0]["id"] == "track_dl_1"
    assert data["downloaded_tracks"][0]["title"] == "Test Downloaded Song"

    # Verify the service method was called correctly
    # download_youtube_url(url: str, db: Session, schemas_module) -> dict
    mock_download_func.assert_called_once_with(TEST_URL, ANY, ANY) # db_session and schemas module are passed


def test_download_url_invalid_payload(client: TestClient):
    response = client.post("/api/download", json={"wrong_field": "some_value"})
    assert response.status_code == 422 # Unprocessable Entity for Pydantic validation error


def test_list_tracks(client: TestClient, db_session): # db_session from conftest.py
    # Add a track to the test database
    # First, ensure related entities like Artist and Album exist if they are non-nullable FKs
    test_artist = models.Artist(name="Test Artist for List") # PK is name
    db_session.add(test_artist)
    # db_session.commit() # Commit separately or together later

    test_album = models.Album(id="album_list_1", title="Test Album for List", artist_name=test_artist.name, type=models.AlbumType.album)
    db_session.add(test_album)
    # db_session.commit()

    test_track = models.Track(
        id="track_list_1", # Use string ID
        title="Test Track 1 from DB",
        file_path="/music/track1_db.mp3",
        download_date=datetime.now(), # SQLAlchemy model expects datetime
        album_id=test_album.id, # Use string FK
        # artist_id=test_artist.id, # Artist is linked via Album or directly if model changes
        position=1,
        url="http://example.com/track1_db"
    )
    db_session.add(test_track)
    db_session.commit() # Commit all additions

    diagnostic_log(f"\nDEBUG [TEST]: db_session ID in test_list_tracks: {id(db_session)}") # Added for diagnostics
    # Diagnostic: Check if track is in db_session before API call
    count_before_api = db_session.query(models.Track).count()
    diagnostic_log(f"\nDEBUG: Track count in db_session before API call: {count_before_api}")
    retrieved_track_direct = db_session.query(models.Track).filter_by(id="track_list_1").first()
    if retrieved_track_direct:
        diagnostic_log(f"DEBUG: Retrieved track '{retrieved_track_direct.title}' directly from db_session.")
    else:
        diagnostic_log("DEBUG: Track 'track_list_1' NOT FOUND directly in db_session.")

    response = client.get("/api/tracks") # Corrected URL, no trailing slash
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1 # Should be at least one
    
    found = False
    for track_data in data:
        if track_data["id"] == "track_list_1":
            assert track_data["title"] == "Test Track 1 from DB"
            found = True
            break
    assert found, "Test track not found in response"


def test_list_albums(client: TestClient, db_session):
    # Ensure related Artist exists if album has a non-nullable artist_id FK
    test_artist_for_album = models.Artist(name="Artist for Album List") # PK is name
    db_session.add(test_artist_for_album)
    # db_session.commit()

    test_album = models.Album(
        id="album_list_2", # Use string ID
        title="Test Album 1 from DB",
        artist_name=test_artist_for_album.name, # Link by name
        type=models.AlbumType.album,
        url="http://example.com/album1_db"
    )
    db_session.add(test_album)
    db_session.commit() # Commit all additions

    diagnostic_log(f"\nDEBUG [TEST]: db_session ID in test_list_albums: {id(db_session)}") # Added for diagnostics
    response = client.get("/api/albums") # Corrected URL, no trailing slash
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    
    found = False
    for album_data in data:
        if album_data["id"] == "album_list_2":
            assert album_data["title"] == "Test Album 1 from DB"
            found = True
            break
    assert found, "Test album not found in response"
