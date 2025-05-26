from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock, ANY # For mocking service calls
from backend.app.services import playback_manager # Import the actual instance to patch its methods
from backend.app import schemas # For request model instances
from sqlalchemy.orm import Session # For type hinting test_db_session

# client fixture is defined in conftest.py
# test_db_session fixture is defined in conftest.py

# Patching methods directly on the singleton instance
@patch.object(playback_manager, 'play_track')
def test_play_track_success(mock_play_track, client: TestClient, db_session: Session):
    # Mock the service method to return a success-like dictionary
    mock_play_track.return_value = {"status": "playing", "track_id": "test_id", "title": "Test Song", "elapsed_time": 0}
    
    # Create a request payload instance
    play_request = schemas.PlayTrackRequest(track_id="test_id")
    
    response = client.post("/api/player/play", json=play_request.model_dump())
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "playing"
    assert data["track_id"] == "test_id"
    mock_play_track.assert_called_once_with("test_id", ANY) # track_id positional, db positional

def test_play_track_missing_id(client: TestClient):
    response = client.post("/api/player/play", json={})
    assert response.status_code == 422

@patch.object(playback_manager, 'pause_playback')
def test_pause_playback(mock_pause, client: TestClient):
    mock_pause.return_value = {"status": "paused", "track_id": "test_id", "elapsed_time": 60}
    response = client.post("/api/player/pause")
    assert response.status_code == 200
    assert response.json()["status"] == "paused"
    mock_pause.assert_called_once()

@patch.object(playback_manager, 'get_player_status')
def test_get_player_status(mock_get_status, client: TestClient):
    mock_get_status.return_value = {
        "track_id": "test_id", 
        "path": "/fake/path/to/song.mp3", 
        "duration": 180, 
        "elapsed_time": 30.0,
        "is_playing": True, 
        "is_paused": False, 
        "volume": 70,
        "random_mode": False, 
        "auto_play_next": True, 
        "play_history_size": 1,
        "message": "Player is active", 
        "status": "playing" 
    }
    response = client.get("/api/player/player/status")
    assert response.status_code == 200
    data = response.json()
    assert data["is_playing"] is True
    assert data["track_id"] == "test_id"
    # db session is also passed to get_player_status as a keyword arg
    mock_get_status.assert_called_once_with(db=ANY)

@patch.object(playback_manager, 'set_volume')
def test_set_volume(mock_set_volume, client: TestClient):
    mock_set_volume.return_value = {"status": "volume_set", "level": 50}
    response = client.post("/api/player/volume", json={"level": 50})
    assert response.status_code == 200
    assert response.json()["level"] == 50
    mock_set_volume.assert_called_once_with(50)

@patch.object(playback_manager, 'stop_playback')
def test_stop_playback(mock_stop, client: TestClient):
    mock_stop.return_value = {"status": "stopped", "track_id": "test_id"}
    response = client.post("/api/player/stop")
    assert response.status_code == 200
    assert response.json()["status"] == "stopped"
    mock_stop.assert_called_once()

@patch.object(playback_manager, 'resume_playback')
def test_resume_playback(mock_resume, client: TestClient):
    mock_resume.return_value = {"status": "resumed", "track_id": "test_id"}
    response = client.post("/api/player/resume")
    assert response.status_code == 200
    assert response.json()["status"] == "resumed"
    mock_resume.assert_called_once()

@patch.object(playback_manager, 'play_next_track')
def test_play_next_track(mock_play_next, client: TestClient):
    mock_play_next.return_value = {"status": "playing", "track_id": "next_track_id", "duration": 200}
    response = client.post("/api/player/next")
    assert response.status_code == 200
    assert response.json()["track_id"] == "next_track_id"
    mock_play_next.assert_called_once_with(ANY) # db positional

@patch.object(playback_manager, 'play_previous_track')
def test_play_previous_track(mock_play_previous, client: TestClient):
    mock_play_previous.return_value = {"status": "playing", "track_id": "prev_track_id", "duration": 150}
    response = client.post("/api/player/previous")
    assert response.status_code == 200
    assert response.json()["track_id"] == "prev_track_id"
    mock_play_previous.assert_called_once_with(ANY) # db positional

@patch.object(playback_manager, 'skip_logic')
def test_skip_forward(mock_skip_logic, client: TestClient):
    mock_skip_logic.return_value = {"status": "skipped", "track_id": "test_id", "new_elapsed_time": 45.0}
    response = client.post("/api/player/skip_forward")
    assert response.status_code == 200
    assert response.json()["status"] == "skipped"
    mock_skip_logic.assert_called_once_with(forward=True, db=ANY)

@patch.object(playback_manager, 'skip_logic')
def test_skip_backward(mock_skip_logic, client: TestClient):
    mock_skip_logic.return_value = {"status": "skipped", "track_id": "test_id", "new_elapsed_time": 15.0}
    response = client.post("/api/player/skip_backward")
    assert response.status_code == 200
    assert response.json()["status"] == "skipped"
    mock_skip_logic.assert_called_once_with(forward=False, db=ANY)
