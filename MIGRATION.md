# Migration from SQLite to PostgreSQL

This document outlines the migration of the music player application's database from SQLite to PostgreSQL.

## Changes Made

### Database Migration
- Migrated from SQLite to PostgreSQL 14+
- Created new database schema in PostgreSQL
- Migrated all existing data from SQLite to PostgreSQL
- Updated database connection logic to use SQLAlchemy with PostgreSQL

### Code Changes
- Replaced direct SQLite queries with SQLAlchemy ORM
- Added proper connection pooling and session management
- Improved error handling and logging
- Added support for concurrent database access

## Setup Instructions

### Prerequisites
- PostgreSQL 14 or later
- Python 3.8+
- Required Python packages (install via `pip install -r requirements.txt`)

### Database Setup
1. Create a new PostgreSQL database:
   ```sql
   CREATE DATABASE music_player;
   ```

2. Create a database user (optional but recommended):
   ```sql
   CREATE USER music_user WITH PASSWORD 'your_secure_password';
   GRANT ALL PRIVILEGES ON DATABASE music_player TO music_user;
   ```

3. Set up environment variables:
   Create a `.env` file in the project root with:
   ```
   DATABASE_URL=postgresql://music_user:your_secure_password@localhost:5432/music_player
   ```

### Data Migration
1. The migration script has already been run to move data from SQLite to PostgreSQL
2. Original SQLite databases have been backed up to `old_sqlite_backups/`

## Verification

### Check Database Connection
```bash
python3 -c "from db_models import SessionLocal; db = SessionLocal(); db.execute('SELECT 1'); print('✅ Database connection successful')"
```

### Verify Data Migration
```bash
psql -d music_player -c "SELECT 'Albums:' as table_name, COUNT(*) FROM albums UNION SELECT 'Tracks:', COUNT(*) FROM tracks UNION SELECT 'Artists:', COUNT(*) FROM artists;"
```

## Rollback Procedure

If you need to revert to SQLite:

1. Restore the SQLite database from backup:
   ```bash
   cp old_sqlite_backups/music_metadata.db .
   ```

2. Update `.env` to use SQLite:
   ```
   DATABASE_URL=sqlite:///music_metadata.db
   ```

3. Revert code changes if necessary (the code is designed to work with both databases)

## Known Issues

- The application now requires PostgreSQL to be running
- Some SQLite-specific features have been replaced with PostgreSQL equivalents
- Database backups should now be done using PostgreSQL tools (e.g., `pg_dump`)

## Performance Considerations

- PostgreSQL generally offers better performance for concurrent access
- Queries have been optimized for PostgreSQL
- Consider setting up proper indexes for your query patterns

## Maintenance

### Backups
Use PostgreSQL's built-in backup tools:
```bash
pg_dump music_player > music_player_backup_$(date +%Y%m%d).sql
```

### Monitoring
Consider setting up monitoring for:
- Database connection pool usage
- Query performance
- Disk space usage

## Troubleshooting

### Common Issues
1. **Connection refused**: Ensure PostgreSQL is running and accessible
2. **Authentication failed**: Verify username/password in `.env`
3. **Permission denied**: Check database user permissions

### Getting Help
If you encounter issues, please provide:
1. The exact error message
2. Relevant logs
3. Steps to reproduce the issue

## Future Improvements

- [ ] Set up database migrations (e.g., using Alembic)
- [ ] Add database connection retry logic
- [ ] Implement connection pooling configuration
- [ ] Add database performance monitoring
