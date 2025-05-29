from downloader import download_missing_playlists

playlist_urls = [
    "https://music.youtube.com/playlist?list=OLAK5uy_l2kegzS51vz1X8cmkXCmDx3MRNaaiKwAs",
    "https://music.youtube.com/playlist?list=OLAK5uy_nT-MFpEHDdFS8RhIAA1400PeLc6pMsxbk",
    "https://music.youtube.com/playlist?list=OLAK5uy_mXiyBY7MdeuHz36cMMpSGWkVj2UvHQTCw",
    "https://music.youtube.com/playlist?list=OLAK5uy_nAYgKz53YS5bni3J4Y9D3G3MQDLd8GhhA",
    "https://music.youtube.com/browse/VLPLQd8lFxH9g22u4BtrB3_fSzroInjS7IvQ"
]

download_missing_playlists(playlist_urls)
