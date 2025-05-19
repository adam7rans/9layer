# 9layer - Advanced YouTube Downloader & Music Player

## Features
- **Smart Downloading**: Videos, audio-only, or entire playlists
- **Music Player**: Beautiful terminal interface with playback controls
- **Audio Management**: Automatic organization in `/music` directory
- **System Integration**: Volume controls and macOS/Windows support

## Installation
```bash
# Required packages
pip install yt-dlp

# Optional: For audio conversion
brew install ffmpeg  # macOS
# OR
sudo apt install ffmpeg  # Linux
```

## 9layer Downloader Usage

### Basic Commands
```bash
# Download video (best quality)
python downloader.py "https://youtube.com/watch?v=VIDEO_ID"

# Download audio only (high quality MP3)
python downloader.py "URL" --audio-only

# Custom download location
python downloader.py "URL" --path "~/Music/MyAlbum"
```

### Advanced Features
```bash
# Download entire playlist (video or audio)
python downloader.py "PLAYLIST_URL" --audio-only

# Download specific playlist items (e.g., tracks 5-10)
python downloader.py "PLAYLIST_URL" --playlist-items 5-10

# Custom audio quality (192kbps)
python downloader.py "URL" --audio-only --quality 192
```

## 9layer Music Player
```bash
python 9layer.py
```

### Interactive Controls
| Key | Action |
|-----|--------|
| `N` | Next track |
| `P` | Previous track |
| `R` | Toggle random mode |
| `=` | Volume up |
| `-` | Volume down |
| `M` | Mute toggle |
| `Q` | Quit player |

## Project Structure
```
9layer/
├── downloader.py - Main download script
├── 9layer.py - Interactive music player
├── music/ - Downloaded audio storage
└── README.md - This documentation
```

## Requirements
- Python 3.8+
- yt-dlp (YouTube downloader)
- ffmpeg (for audio conversion)

## License
Open source - [MIT License](LICENSE)
