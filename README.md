# YouTube Downloader & Music Player

## Features
- Download YouTube videos or extract audio
- Play downloaded music with interactive controls
- Supports playlists and album downloads
- Volume control and random playback

## Installation
```bash
pip install yt-dlp
```

## YouTube Downloader Usage

### Basic Commands
```bash
# Download video (best quality)
python youtube_downloader.py "https://youtube.com/watch?v=VIDEO_ID"

# Download audio only (MP3)
python youtube_downloader.py "https://youtube.com/watch?v=VIDEO_ID" --audio-only

# Specify download directory
python youtube_downloader.py "URL" --path "/custom/path"
```

### Playlist/Album Downloads
```bash
# Download entire playlist
python youtube_downloader.py "https://youtube.com/playlist?list=PLAYLIST_ID"

# Audio-only playlist
python youtube_downloader.py "PLAYLIST_URL" --audio-only

# Limit playlist items
python youtube_downloader.py "PLAYLIST_URL" --audio-only --playlist-items 1-10
```

## Music Player Controls
```bash
python player.py
```

### Interactive Controls
- `N` - Next track
- `P` - Previous track
- `R` - Toggle random mode
- `=` - Volume up
- `-` - Volume down
- `M` - Mute toggle
- `Q` - Quit player

### Auto-Download & Play
Songs are automatically saved to `/music` directory and available for playback.

## Requirements
- Python 3.6+
- yt-dlp
- ffmpeg (for audio conversion)
