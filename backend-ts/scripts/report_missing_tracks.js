#!/usr/bin/env node
/*
  Report tracks whose filePath is missing on disk.

  Usage:
    node scripts/report_missing_tracks.js [--limit 0] [--json] [--out missing_tracks.json] [--count]

  Defaults to human-readable grouped output. Use --json for structured output.
*/
const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { limit: 0, json: false, out: null, count: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--limit') opts.limit = parseInt(args[++i], 10) || 0;
    else if (a === '--json') opts.json = true;
    else if (a === '--out') opts.out = args[++i] || null;
    else if (a === '--count') opts.count = true;
  }
  return opts;
}

async function main() {
  const prisma = new PrismaClient();
  const opts = parseArgs();
  try {
    const take = opts.limit && opts.limit > 0 ? opts.limit : undefined;
    const tracks = await prisma.track.findMany({
      include: { artist: true, album: true },
      orderBy: [{ artist: { name: 'asc' } }, { title: 'asc' }],
      take,
    });

    const missing = [];
    const altExts = ['.mp3', '.m4a', '.flac', '.aac', '.ogg', '.wma', '.wav', '.webm'];
    for (const t of tracks) {
      // If DB has no path, consider missing
      if (!t.filePath) {
        missing.push(t);
        continue;
      }

      // If exact path exists, not missing
      if (fs.existsSync(t.filePath)) continue;

      // Try alternate extensions in the same directory using the same basename
      try {
        const dir = path.dirname(t.filePath);
        const base = path.basename(t.filePath, path.extname(t.filePath));
        let found = false;
        for (const ext of altExts) {
          const candidate = path.join(dir, base + ext);
          if (fs.existsSync(candidate)) { found = true; break; }
        }
        if (!found) missing.push(t);
      } catch {
        // If any error during checking, err on the side of reporting missing
        missing.push(t);
      }
    }

    if (opts.count) {
      console.log(missing.length);
      return;
    }

    if (opts.json) {
      const items = missing.map((t) => ({
        id: t.id,
        youtubeId: t.youtubeId || null,
        artist: t.artist?.name || null,
        title: t.title,
        album: t.album?.title || null,
        albumYoutubeId: t.album?.youtubeId || null,
        expectedPath: t.filePath || null,
        exists: false,
        reason: 'file_missing',
      }));

      // Build metadata
      const byArtistCount = new Map();
      const byAlbumCount = new Map(); // key: artist|||album
      for (const t of items) {
        const artistName = t.artist || 'Unknown Artist';
        byArtistCount.set(artistName, (byArtistCount.get(artistName) || 0) + 1);
        const albumTitle = t.album || 'Unknown Album';
        const key = `${artistName}|||${albumTitle}`;
        byAlbumCount.set(key, (byAlbumCount.get(key) || 0) + 1);
      }

      const byArtist = Array.from(byArtistCount.entries())
        .map(([artist, count]) => ({ artist, count }))
        .sort((a, b) => a.artist.localeCompare(b.artist));

      const byAlbum = Array.from(byAlbumCount.entries())
        .map(([key, count]) => {
          const [artist, album] = key.split('|||');
          return { artist, album, count };
        })
        .sort((a, b) => a.artist === b.artist ? a.album.localeCompare(b.album) : a.artist.localeCompare(b.artist));

      const meta = {
        generatedAt: new Date().toISOString(),
        totalTracksScanned: tracks.length,
        totalMissing: items.length,
        limitApplied: !!take,
        byArtist,
        byAlbum,
      };

      const payload = { meta, items };
      const json = JSON.stringify(payload, null, 2);
      if (opts.out) {
        fs.writeFileSync(opts.out, json, 'utf8');
        console.error(`Wrote ${items.length} missing tracks to ${opts.out}`);
      } else {
        console.log(json);
      }
      return;
    }

    // Human-readable grouped output by artist (default)
    const byArtist = new Map();
    for (const t of missing) {
      const name = t.artist?.name || 'Unknown Artist';
      if (!byArtist.has(name)) byArtist.set(name, []);
      byArtist.get(name).push(t);
    }

    console.log(`Missing files: ${missing.length}/${tracks.length}${take ? ` (limited to ${take})` : ''}`);
    const artists = Array.from(byArtist.keys()).sort();
    for (const a of artists) {
      const list = byArtist.get(a);
      console.log(`\nArtist: ${a} (${list.length})`);
      for (const t of list.slice(0, 20)) {
        console.log(`  - ${t.title} [${t.id}] -> ${t.filePath || '<empty>'}`);
      }
      if (list.length > 20) {
        console.log(`  ...and ${list.length - 20} more`);
      }
    }

    console.log('\nNote: Schema has no "available" field in Track; this script only reports.');
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
