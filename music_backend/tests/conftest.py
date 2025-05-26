import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.main import app # Main FastAPI application
from app.database import Base, get_db
import os

# Use an in-memory SQLite database for testing if not mocking all DB interactions
# For this subtask, we primarily mock services, so direct DB override might not be fully exercised.
SQLALCHEMY_DATABASE_URL_TEST = "sqlite:///./test_music_db.sqlite"

@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(SQLALCHEMY_DATABASE_URL_TEST, connect_args={"check_same_thread": False})
    Base.metadata.create_all(bind=engine) # Create tables for the test DB
    yield engine
    # Clean up the test database file after tests are done (optional)
    if os.path.exists("./test_music_db.sqlite"):
        os.remove("./test_music_db.sqlite")


@pytest.fixture(scope="function")
def db_session(db_engine):
    connection = db_engine.connect()
    transaction = connection.begin()
    SessionLocalTest = sessionmaker(autocommit=False, autoflush=False, bind=connection)
    session = SessionLocalTest()
    yield session
    session.close()
    transaction.rollback()
    connection.close()

@pytest.fixture(scope="function")
def client(db_session):
    # Override the get_db dependency for the test client
    def override_get_db():
        try:
            yield db_session
        finally:
            db_session.close()
    
    app.dependency_overrides[get_db] = override_get_db
    
    with TestClient(app) as c:
        yield c
    
    app.dependency_overrides.clear() # Clear overrides after test
