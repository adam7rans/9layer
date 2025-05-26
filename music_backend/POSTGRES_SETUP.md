# PostgreSQL Setup Guide

This guide provides instructions on how to install and configure PostgreSQL for the Music Backend application.

## Installation

Follow the instructions for your operating system:

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install postgresql postgresql-contrib
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### macOS (using Homebrew)
```bash
brew install postgresql
brew services start postgresql
```

### Windows
Download the installer from the [PostgreSQL website](https://www.postgresql.org/download/windows/) and follow the installation wizard.

## Database Creation

Once PostgreSQL is installed, you need to create a database and a user for the application.

1.  **Open the PostgreSQL interactive terminal (`psql`):**
    *   On Linux/macOS, you might need to switch to the `postgres` user first:
        ```bash
        sudo -u postgres psql
        ```
    *   On Windows, you should find `psql` in the Start Menu under PostgreSQL.

2.  **Create a new user (role):**
    Replace `music_user` and `your_strong_password` with your desired username and a secure password.
    ```sql
    CREATE USER music_user WITH PASSWORD 'your_strong_password';
    ```

3.  **Create a new database:**
    Replace `music_db` with your desired database name.
    ```sql
    CREATE DATABASE music_db OWNER music_user;
    ```

4.  **Grant privileges to the user on the database:**
    ```sql
    GRANT ALL PRIVILEGES ON DATABASE music_db TO music_user;
    ```

5.  **Connect to your new database as the new user to verify (optional):**
    ```sql
    \c music_db music_user
    ```
    You will be prompted for the password.

## Environment Variables
The application will expect database connection details via environment variables. Create a `.env` file in the `music_backend` directory with the following (adjust values as per your setup):

```env
DATABASE_URL=postgresql://music_user:your_strong_password@localhost/music_db
```

Make sure this `.env` file is added to your `.gitignore` if it's not already.
