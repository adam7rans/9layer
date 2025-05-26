import sys
from pathlib import Path

project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

import pytest
import os
from starlette.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from backend.main import create_app
from backend.app.database import Base, get_db as original_app_get_db # Import original get_db for override key
from backend.app.models import Track, Album, Artist # Ensure models are imported for Base.metadata

from .diag_logger import diagnostic_log

# Determine the repository root for path manipulation if needed
repository_root = Path(__file__).resolve().parent.parent # backend/tests/ -> backend/
# sys.path.insert(0, str(repository_root.parent)) # To import 'from backend...' -> should be project root '9layer'

@pytest.fixture(scope="session", autouse=True)
def manage_testing_env_variable():
    """Set and unset TESTING_ENV for the entire test session."""
    diagnostic_log("manage_testing_env_variable (session_start): Setting TESTING_ENV=true")
    original_value = os.getenv("TESTING_ENV")
    os.environ["TESTING_ENV"] = "true"
    yield
    diagnostic_log("manage_testing_env_variable (session_finish): Restoring/Deleting TESTING_ENV")
    if original_value is None:
        del os.environ["TESTING_ENV"]
    else:
        os.environ["TESTING_ENV"] = original_value

@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
    diagnostic_log(f"db_engine (session-scoped): Engine created.")
    yield engine
    diagnostic_log(f"db_engine (session-scoped): Engine closed/disposed (implicitly).")

@pytest.fixture(scope="function")
def setup_database_tables(db_engine):
    diagnostic_log(f"setup_database_tables (function-scoped): Creating tables for {db_engine}.")
    Base.metadata.create_all(bind=db_engine)
    yield
    diagnostic_log(f"setup_database_tables (function-scoped): Dropping tables for {db_engine}.")
    Base.metadata.drop_all(bind=db_engine)

TestSessionFactory = sessionmaker(autocommit=False, autoflush=False)

@pytest.fixture(scope="function")
def db_session(db_engine, setup_database_tables):
    connection = db_engine.connect()
    transaction = connection.begin()
    session = TestSessionFactory(bind=connection)
    diagnostic_log(f"db_session fixture: Created session ID {id(session)} bound to connection {id(connection)} within transaction {id(transaction)}.")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()
        diagnostic_log(f"db_session fixture: Closed session, rolled back transaction, closed connection for session ID {id(session)}.")

@pytest.fixture(scope="function")
def client(db_session): # db_session is the test-specific session
    app_instance = create_app() # Create a fresh app instance

    # Define the override function locally, capturing the current db_session via closure
    def local_override_get_db():
        try:
            diagnostic_log(f"DEBUG [OVERRIDE_GENERATOR local_override_get_db]: Called. Yielding db_session ID: {id(db_session)}. Original get_db ID for override key: {id(original_app_get_db)}")
            yield db_session
        finally:
            # The db_session is managed by its own fixture (begin transaction, rollback, close)
            diagnostic_log(f"DEBUG [OVERRIDE_GENERATOR local_override_get_db]: Exiting. db_session ID: {id(db_session)} was yielded.")
            pass # No explicit close here, db_session fixture handles its lifecycle

    # Apply the override using the original get_db function object as the key
    app_instance.dependency_overrides[original_app_get_db] = local_override_get_db
    diagnostic_log(f"client fixture: Applied override for original_app_get_db (ID: {id(original_app_get_db)}) with local_override_get_db (which yields session ID: {id(db_session)})")

    # Create TestClient with the app instance that has the override
    test_client_instance = TestClient(app_instance)
    yield test_client_instance

    # Clean up the override after the test
    diagnostic_log(f"client fixture: Clearing dependency_overrides for original_app_get_db (ID: {id(original_app_get_db)}).")
    app_instance.dependency_overrides.clear()

# Add pytest_sessionstart and pytest_sessionfinish for global setup/teardown if not already managed by autouse fixtures
@pytest.hookimpl(tryfirst=True)
def pytest_sessionstart(session):
    diagnostic_log("======== TEST SESSION STARTED (from conftest.py hook) ========")

# No specific pytest_sessionfinish needed if all session cleanup is in autouse fixtures
