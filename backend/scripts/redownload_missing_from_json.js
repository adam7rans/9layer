#!/usr/bin/env node
/*
  Redownload missing tracks by reading missing_tracks.json and calling the backend downloader.

  Usage:
    node backend-ts/scripts/redownload_missing_from_json.js \
      --input missing_tracks.json \
      [--limit 50] \
      [--concurrency 2] \
      [--dry-run] \
      [--artist "Artist Name"] \
      [--album "Album Title"]

  Notes:
  - Expects backend TypeScript server running on http://localhost:8000
  - Reuses existing /download/audio route; backend decides final file placement
  - Accepts both array-form JSON (legacy) and { meta, items } format
*/

const fs = require('fs');
const path = require('path');

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    input: 'missing_tracks.json',
    limit: 0,
    concurrency: 2,
    dryRun: false,
    artist: null,
    album: null,
    baseUrl: process.env.DOWNLOAD_BASE_URL || 'http://localhost:8000',
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--input') opts.input = args[++i];
    else if (a === '--limit') opts.limit = parseInt(args[++i], 10) || 0;
    else if (a === '--concurrency') opts.concurrency = parseInt(args[++i], 10) || 2;
    else if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--artist') opts.artist = args[++i];
    else if (a === '--album') opts.album = args[++i];
    else if (a === '--base-url') opts.baseUrl = args[++i];
  }
  return opts;
}

function loadItems(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(raw);
  if (Array.isArray(data)) return data; // legacy format
  if (data && Array.isArray(data.items)) return data.items; // new format { meta, items }
  throw new Error('Unsupported JSON format: expected array or { items: [] }');
}

function filterAndLimit(items, { limit, artist, album }) {
  let res = items;
  if (artist) {
    res = res.filter((x) => (x.artist || '').toLowerCase().includes(artist.toLowerCase()));
  }
  if (album) {
    res = res.filter((x) => (x.album || '').toLowerCase().includes(album.toLowerCase()));
  }
  // unique by youtubeId, preserve order
  const seen = new Set();
  res = res.filter((x) => {
    const id = x.youtubeId || x.id;
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  if (limit && limit > 0) res = res.slice(0, limit);
  return res;
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status} ${res.statusText}`);
    err.response = json;
    throw err;
  }
  return json;
}

async function run() {
  const opts = parseArgs();
  const inputPath = path.resolve(process.cwd(), opts.input);
  if (!fs.existsSync(inputPath)) {
    console.error(`Input file not found: ${inputPath}`);
    process.exit(1);
  }
  const items = loadItems(inputPath);
  const selected = filterAndLimit(items, opts);

  console.log(`Will process ${selected.length} unique tracks${opts.dryRun ? ' (dry-run)' : ''}`);

  if (opts.dryRun) {
    for (const it of selected) {
      console.log(`DRY: ${it.artist} - ${it.title} [${it.youtubeId}] -> ${it.expectedPath}`);
    }
    return;
  }

  // simple concurrency control
  let active = 0; let index = 0; let success = 0; let fail = 0;
  const results = [];

  async function next() {
    if (index >= selected.length) return;
    const it = selected[index++];
    active++;
    const url = `${opts.baseUrl.replace(/\/$/, '')}/download/audio`;
    const youtubeUrl = `https://www.youtube.com/watch?v=${it.youtubeId || it.id}`;
    try {
      const res = await postJson(url, { url: youtubeUrl, format: 'audio', quality: 'best' });
      success++;
      results.push({ ok: true, id: it.youtubeId || it.id, res });
      const saved = res.filePath || (res.metadata && res.metadata.filePath) || 'saved (path unknown)';
      console.log(`OK  ${success + fail}/${selected.length}: ${it.artist} - ${it.title} -> ${saved}`);
    } catch (e) {
      fail++;
      results.push({ ok: false, id: it.youtubeId || it.id, error: e.message, response: e.response });
      console.error(`ERR ${success + fail}/${selected.length}: ${it.artist} - ${it.title} :: ${e.message}`);
    } finally {
      active--;
      if (index < selected.length) {
        // kick more
        while (active < opts.concurrency && index < selected.length) await next();
      }
    }
  }

  // Kick off
  const starters = Math.min(opts.concurrency, selected.length);
  const kicks = [];
  for (let i = 0; i < starters; i++) kicks.push(next());
  await Promise.all(kicks);

  console.log(`\nDone. Success=${success}, Failed=${fail}`);
}

// Ensure fetch exists (Node 18+); otherwise instruct user
if (typeof fetch === 'undefined') {
  console.error('This script requires Node 18+ (global fetch). Alternatively, install node-fetch and adapt the script.');
  process.exit(1);
}

run().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
