from downloader import download_missing_playlists

playlist_urls = [
    "https://music.youtube.com/playlist?list=OLAK5uy_mZ8GqAQaWyFT0o3f8PPgxGrh5Ykkcadhw",
    "https://music.youtube.com/playlist?list=OLAK5uy_mpNpWNYbbQjTGgoYgI7klaApNUmHmYGzs",
    "https://music.youtube.com/playlist?list=OLAK5uy_nyYdePuk8CdJyGKlDoObG1UjZFSVIKD5Y",
    "https://music.youtube.com/playlist?list=OLAK5uy_ncVUT5BP8616z1v2WotxZlIL9kWxQ4tYY",
    "https://music.youtube.com/playlist?list=OLAK5uy_mnwCE7rNsmUAYP1iJFOECyvTTrNZWfacg",
    "https://music.youtube.com/playlist?list=OLAK5uy_nc8KjgcZoiX8wIogP9lm5BzBfepScP6CU",
    "https://music.youtube.com/playlist?list=OLAK5uy_mlpd2x0uA1_YPugv6HmpZuaedmW0f_sIw",
    "https://music.youtube.com/playlist?list=OLAK5uy_n1DDhTrGrFWWBtgLqD15bOQvJXgD8UhPo",
    "https://music.youtube.com/playlist?list=OLAK5uy_lQIgY9VfGNqsmjG9s3pyZ95epfpz6XCXo"
]

download_missing_playlists(playlist_urls)
