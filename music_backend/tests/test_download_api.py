from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock # For mocking service calls
from app import schemas # Import your Pydantic schemas
from app import models # Import your SQLAlchemy models
from datetime import datetime # For datetime objects

# client fixture is defined in conftest.py
# db_session fixture is defined in conftest.py

@patch("app.services.download_service.download_youtube_url")
def test_download_url_success(mock_download_service, client: TestClient):
    # Mock the return value of the service function
    # Ensure the Track schema is correctly instantiated or a dict matching its structure is returned
    mock_download_service.return_value = {
        "status": "success",
        "downloaded_tracks": [
            # Pydantic schema used for the response model, so mock should align
            schemas.Track(
                id="testtrack123", 
                title="Test Track", 
                file_path="/path/to/test.mp3", 
                download_date=datetime.now(), # Or a fixed datetime string parsable by Pydantic
                album_id="testalbum1",
                position=1,
                url="http://example.com/video"
            ).dict() # Convert to dict if the service returns dicts
        ],
        "message": "Processed 1 tracks."
    }
    
    response = client.post("/api/download", json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"})
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert len(data["downloaded_tracks"]) == 1
    assert data["downloaded_tracks"][0]["id"] == "testtrack123"
    # The service is called with URL, db session, and schemas module.
    # We can use MagicMock for db and schemas if we don't need to inspect them.
    mock_download_service.assert_called_once_with("https://www.youtube.com/watch?v=dQw4w9WgXcQ", MagicMock(), schemas)


def test_download_url_invalid_payload(client: TestClient):
    response = client.post("/api/download", json={"wrong_field": "some_value"})
    assert response.status_code == 422 # Unprocessable Entity for Pydantic validation error


def test_list_tracks(client: TestClient, db_session): # db_session from conftest.py
    # Add a track to the test database
    test_track = models.Track(
        id="track1", 
        title="Test Track 1 from DB", 
        file_path="/music/track1_db.mp3",
        download_date=datetime.now(), # SQLAlchemy model expects datetime
        album_id="album1_db",
        position=1,
        url="http://example.com/track1_db"
    )
    db_session.add(test_track)
    db_session.commit()
    db_session.refresh(test_track) # Ensure all fields are loaded, esp. defaults

    response = client.get("/api/tracks")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1 # Should be at least one
    
    found = False
    for track_data in data:
        if track_data["id"] == "track1":
            assert track_data["title"] == "Test Track 1 from DB"
            found = True
            break
    assert found, "Test track not found in response"

# Similar integration test for /api/albums can be added
def test_list_albums(client: TestClient, db_session):
    test_album = models.Album(
        id="album1",
        title="Test Album 1 from DB",
        artist_name="Test Artist",
        type=models.AlbumType.album, # Use the enum from models
        url="http://example.com/album1"
    )
    db_session.add(test_album)
    db_session.commit()
    db_session.refresh(test_album)

    response = client.get("/api/albums")
    assert response.status_code == 200
    data = response.json()
    assert len(data) >= 1
    
    found = False
    for album_data in data:
        if album_data["id"] == "album1":
            assert album_data["title"] == "Test Album 1 from DB"
            found = True
            break
    assert found, "Test album not found in response"
