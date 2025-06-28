-- Create tables in PostgreSQL
CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY,
    title TEXT,
    artist TEXT,
    type TEXT CHECK (type IN ('album', 'playlist')),
    url TEXT
);

CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    title TEXT,
    album_id TEXT REFERENCES albums(id) ON DELETE CASCADE,
    position INTEGER,
    url TEXT,
    file_path TEXT,
    download_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS artists (
    name TEXT PRIMARY KEY,
    description TEXT
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tracks_album_id ON tracks(album_id);
CREATE INDEX IF NOT EXISTS idx_albums_artist ON albums(artist);

-- Grant permissions to music_user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO music_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO music_user;
