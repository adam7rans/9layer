import os
from datetime import datetime
import pytest

# Define the log file path relative to this file (tests/diag_logger.py)
LOG_FILE_PATH = os.path.join(os.path.dirname(__file__), "..", "test_diagnostics.log")

def diagnostic_log(message: str):
    """Appends a message to the diagnostic log file."""
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")
    with open(LOG_FILE_PATH, "a") as f:
        f.write(f"{timestamp} - {message}\n")

@pytest.hookimpl(tryfirst=True)
def pytest_sessionstart(session):
    """Clear the log file at the beginning of the test session."""
    # This hook will be discovered by pytest if this file is in the tests directory.
    if os.path.exists(LOG_FILE_PATH):
        os.remove(LOG_FILE_PATH)
    diagnostic_log("======== TEST SESSION STARTED (from diag_logger) ========")
