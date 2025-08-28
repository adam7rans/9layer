#!/usr/bin/env node
/*
  Fix track file paths by matching youtubeId to existing files under a root folder.
  Usage:
    node scripts/fix_paths_by_youtubeid.js --root "/Volumes/2TB" --limit 100 [--apply]
*/
const { PrismaClient } = require("@prisma/client");
const { execFile } = require("child_process");
const fs = require("fs");
const path = require("path");

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { root: "/Volumes/2TB", limit: 100, apply: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--apply") opts.apply = true;
    else if (a === "--root") opts.root = args[++i];
    else if (a === "--limit") opts.limit = parseInt(args[++i], 10);
  }
  return opts;
}

function shFind(cmd) {
  // Ensure non-zero exits (e.g., permission denials) don't break us
  const safeCmd = `${cmd} 2>/dev/null || true`;
  return new Promise((resolve) => {
    execFile("bash", ["-lc", safeCmd], { maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve(null);
      const out = stdout.toString().trim();
      resolve(out || null);
    });
  });
}

function findByYoutubeId(root, youtubeId) {
  return new Promise((resolve) => {
    if (!youtubeId) return resolve(null);
    // Many downloaders save files as: "<artist> - <title> [<youtubeId>].ext"
    // So we search for any filename containing the youtubeId and ending with supported audio extensions
    const pattern = `*${youtubeId}*`;
    const cmd = `find ${JSON.stringify(root)} -type f \
      \\( \
        -iname ${JSON.stringify(pattern + ".mp3")} -o \
        -iname ${JSON.stringify(pattern + ".webm")} -o \
        -iname ${JSON.stringify(pattern + ".m4a")} -o \
        -iname ${JSON.stringify(pattern + ".ogg")} -o \
        -iname ${JSON.stringify(pattern + ".opus")} -o \
        -iname ${JSON.stringify(pattern + ".wav")} -o \
        -iname ${JSON.stringify(pattern + ".flac")} \
      \\) \
      -size +1k -print -quit`;
    shFind(cmd).then((found) => resolve(found));
  });
}

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

async function findByHeuristics(root, t) {
  // 1) If existing filePath is under an old root, try prefix replace
  const prefixes = [
    "/Volumes/3ool0ne 2TB",
    "/Volumes/3ool0ne 4TB",
    "/Volumes/3ool0ne 1TB",
    "/Volumes/2TB/coding tools/9layer/music",
  ];
  for (const p of prefixes) {
    if (t.filePath && t.filePath.startsWith(p)) {
      const candidate = path.join(root, t.filePath.substring(p.length));
      if (fs.existsSync(candidate)) return candidate;
    }
  }

  // 2) If we have a filePath, try matching by basename (without extension)
  if (t.filePath) {
    const base = path.basename(t.filePath).replace(/\.[^.]+$/, "");
    if (base) {
      const pattern = `*${base}*`;
      const cmd = `find ${JSON.stringify(root)} -type f \
        \\( \
          -iname ${JSON.stringify(pattern + ".mp3")} -o \
          -iname ${JSON.stringify(pattern + ".webm")} -o \
          -iname ${JSON.stringify(pattern + ".m4a")} -o \
          -iname ${JSON.stringify(pattern + ".ogg")} -o \
          -iname ${JSON.stringify(pattern + ".opus")} -o \
          -iname ${JSON.stringify(pattern + ".wav")} -o \
          -iname ${JSON.stringify(pattern + ".flac")} \
        \\) \
        -size +1k -print -quit`;
      const found = await shFind(cmd);
      if (found) return found;
    }
  }

  // 3) Try combining artist + title
  const combo = normalize(`${t.artist || ""} ${t.title || ""}`);
  if (combo) {
    const parts = combo.split(" ").filter(Boolean).slice(0, 5); // limit pattern size
    if (parts.length) {
      const pattern = `*${parts.join("*")}*`;
      const cmd = `find ${JSON.stringify(root)} -type f \
        \\( \
          -iname ${JSON.stringify(pattern + ".mp3")} -o \
          -iname ${JSON.stringify(pattern + ".webm")} -o \
          -iname ${JSON.stringify(pattern + ".m4a")} -o \
          -iname ${JSON.stringify(pattern + ".ogg")} -o \
          -iname ${JSON.stringify(pattern + ".opus")} -o \
          -iname ${JSON.stringify(pattern + ".wav")} -o \
          -iname ${JSON.stringify(pattern + ".flac")} \
        \\) \
        -size +1k -print -quit`;
      const found = await shFind(cmd);
      if (found) return found;
    }
  }

  return null;
}

async function main() {
  const opts = parseArgs();
  console.log("Options:", opts);
  if (!fs.existsSync(opts.root)) {
    console.error("Root directory not found:", opts.root);
    process.exit(1);
  }
  const prisma = new PrismaClient();
  try {
    // Build a searchable index of candidate files once (faster than many find calls)
    console.log("Indexing audio files under", opts.root, "(this may take a moment)...");
    const listCmd = `find ${JSON.stringify(opts.root)} -type f \
      \\( \
        -iname "*.mp3" -o \
        -iname "*.webm" -o \
        -iname "*.m4a" -o \
        -iname "*.ogg" -o \
        -iname "*.opus" -o \
        -iname "*.wav" -o \
        -iname "*.flac" \
      \\) -size +1k -print`;
    const allFilesRaw = await shFind(listCmd);
    const allFiles = (allFilesRaw ? allFilesRaw.split(/\n+/) : []).filter(Boolean);
    console.log(`Indexed ${allFiles.length} files`);

    function getArtistName(t) {
      if (!t) return '';
      const a = t.artist;
      if (!a) return '';
      if (typeof a === 'string') return a;
      if (typeof a === 'object' && a && typeof a.name === 'string') return a.name;
      return '';
    }

    function normalizedMatchCandidates(t) {
      const title = normalize(typeof t.title === 'string' ? t.title : '');
      const artist = normalize(getArtistName(t));
      const combos = [];
      if (artist && title) combos.push(`${artist} ${title}`);
      if (title) combos.push(title);
      return combos;
    }

    function findByIndex(t) { // Tightened version - require artist directory match for non-youtubeId matches
      const combos = normalizedMatchCandidates(t);
      if (!combos.length) return null;
      
      const artistName = getArtistName(t);
      const artistDir = artistName ? normalize(artistName) : null;
      
      // Try to find unique matches by checking filename (without extension) normalized contains all words in combo
      const matches = [];
      for (const fp of allFiles) {
        // For non-youtubeId matches, require artist directory match to avoid cross-artist errors
        if (!t.youtubeId && artistDir) {
          const dirName = path.dirname(fp).split('/').pop()?.toLowerCase() || '';
          if (normalize(dirName) !== artistDir) continue; // Skip if directory doesn't match artist
        }
        
        const base = path.basename(fp).replace(/\.[^.]+$/, "");
        const norm = normalize(base);
        for (const combo of combos) {
          const words = combo.split(" ").filter(Boolean);
          let ok = true;
          for (const w of words) { if (!norm.includes(w)) { ok = false; break; } }
          if (ok) { matches.push(fp); break; }
        }
      }
      // Prefer unique match; otherwise ambiguous -> skip
      const unique = Array.from(new Set(matches));
      if (unique.length === 1) return unique[0];
      return null;
    }

    const tracks = await prisma.track.findMany({
      where: { youtubeId: { not: null } },
      orderBy: { createdAt: "asc" },
      take: opts.limit,
      select: { id: true, title: true, youtubeId: true, filePath: true, fileSize: true, artist: { select: { name: true } } },
    });
    console.log(`Fetched ${tracks.length} tracks with youtubeId`);

    let matched = 0;
    let toUpdate = [];

    for (const t of tracks) {
      let found = await findByYoutubeId(opts.root, t.youtubeId);
      let matchReason = 'youtubeId';
      if (!found) {
        found = await findByHeuristics(opts.root, t);
        matchReason = 'heuristic';
      }
      if (!found) {
        found = findByIndex(t);
        matchReason = 'fuzzy-match';
      }
      if (found) {
        const size = fs.statSync(found).size;
        const same = t.filePath === found && t.fileSize === size;
        toUpdate.push({ id: t.id, youtubeId: t.youtubeId, oldPath: t.filePath, newPath: found, size, same, matchReason });
        matched++;
        const artistName = getArtistName(t);
        console.log(`✅ ${t.id} ${artistName || ""} - ${t.title || ""} -> ${found} (${size} bytes) [${matchReason}]${same ? " [unchanged]" : ""}`);
      } else {
        console.log(`⚠️  No file found for ${t.id} (youtubeId=${t.youtubeId})`);
      }
    }

    const updates = toUpdate.filter((u) => !u.same);
    console.log("\nSummary:")
    console.log(`  Matched: ${matched}/${tracks.length}`);
    console.log(`  Needs update: ${updates.length}`);

    if (!opts.apply) {
      console.log("\nDry-run only. Use --apply to write changes.");
      // Show first 10 proposed updates with match reasons
      for (const u of updates.slice(0, 10)) {
        console.log(`  - ${u.id}: ${u.oldPath || "<empty>"} -> ${u.newPath} (${u.size}) [${u.matchReason}]`);
      }
      return;
    }

    console.log("\nApplying updates...");
    let applied = 0, skipped = 0, duplicates = 0, errors = 0;
    for (const u of updates) {
      try {
        // Avoid violating unique(filePath): if another track already has this path, skip
        const existing = await prisma.track.findFirst({ where: { filePath: u.newPath } });
        if (existing && existing.id !== u.id) {
          duplicates++;
          if ((duplicates % 10) === 1) {
            console.warn(`  Duplicate target path in use by ${existing.id}; skipping update for ${u.id} -> ${u.newPath}`);
          }
          continue;
        }
        await prisma.track.update({ where: { id: u.id }, data: { filePath: u.newPath, fileSize: u.size } });
        applied++;
        if (applied % 10 === 0) console.log(`  Applied ${applied}/${updates.length}...`);
      } catch (e) {
        // Handle Prisma unique constraint just in case of race condition
        if (e && e.code === 'P2002') {
          duplicates++;
          console.warn(`  Unique constraint (filePath) for ${u.id}; skipping`);
        } else {
          errors++;
          console.warn(`  Error updating ${u.id}:`, e && e.message ? e.message : e);
        }
      }
    }
    console.log(`Applied ${applied}/${updates.length} updates. Skipped duplicates: ${duplicates}. Other errors: ${errors}.`);
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main();
