from fastapi.testclient import TestClient
from unittest.mock import patch, MagicMock
from backend.app.services import playback_service
from backend.app import schemas

# client fixture is defined in conftest.py
# test_db_session fixture is defined in conftest.py

@patch('backend.app.routers.playback_router.command_queue')
def test_command_endpoint(mock_command_queue, client: TestClient):
    """
    Tests the /command endpoint to ensure it correctly puts commands onto the queue.
    """
    # Test "play" command
    play_command = {"command": "play", "track_id": "test_track_id"}
    response = client.post("/api/player/command", json=play_command)
    assert response.status_code == 200
    assert response.json() == {"status": "command sent"}
    mock_command_queue.put.assert_called_with({'action': 'play', 'track_id': 'test_track_id'})

    # Test "pause" command
    pause_command = {"command": "pause"}
    response = client.post("/api/player/command", json=pause_command)
    assert response.status_code == 200
    assert response.json() == {"status": "command sent"}
    mock_command_queue.put.assert_called_with({'action': 'pause'})

    # Test "volume" command
    volume_command = {"command": "volume", "value": 50}
    response = client.post("/api/player/command", json=volume_command)
    assert response.status_code == 200
    assert response.json() == {"status": "command sent"}
    mock_command_queue.put.assert_called_with({'action': 'volume', 'value': 50})


@patch('backend.app.routers.playback_router.playback_manager.get_player_status')
def test_get_current_playback_state_success(mock_get_player_status, client: TestClient):
    """
    Tests the /current endpoint when there is an active playback session.
    """
    # Mock the return value of get_player_status
    mock_get_player_status.return_value = schemas.PlaybackState(
        track_id="test_track_id",
        path="/fake/path",
        duration=180,
        elapsed_time=30.0,
        is_playing=True,
        is_paused=False,
        volume=70,
        random_mode=False,
        auto_play_next=True,
        play_history_size=1,
        message="Player is active",
        status="playing"
    )

    response = client.get("/api/player/current")
    assert response.status_code == 200
    data = response.json()
    assert data["track_id"] == "test_track_id"
    assert data["is_playing"] is True


@patch('backend.app.routers.playback_router.playback_manager.get_player_status')
def test_get_current_playback_state_no_session(mock_get_player_status, client: TestClient):
    """
    Tests the /current endpoint when there is no active playback session.
    """
    # Mock get_player_status to return None
    mock_get_player_status.return_value = None

    response = client.get("/api/player/current")
    assert response.status_code == 404
    assert response.json() == {"detail": "No active playback session."}