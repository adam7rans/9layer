#!/usr/bin/env ts-node

import { PrismaClient } from '@prisma/client';
import fs from 'fs';

interface Options {
  apply: boolean;
  chunk: number;
  json: string | null;
}

function parseArgs(): Options {
  const opts: Options = { apply: false, chunk: 250, json: null };
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') opts.apply = true;
    else if (arg === '--chunk') opts.chunk = parseInt(args[++i] ?? '250', 10);
    else if (arg === '--json') opts.json = args[++i] ?? null;
  }
  return opts;
}

type TrackRecord = {
  id: string;
  title: string;
  filePath: string | null;
  fileSize: number | null;
};

type MissingTrack = {
  id: string;
  title: string;
  filePath: string | null;
  fileSize: number | null;
};

async function scanChunk(prisma: PrismaClient, skip: number, take: number) {
  return prisma.track.findMany({
    orderBy: { createdAt: 'asc' },
    skip,
    take,
    select: { id: true, title: true, filePath: true, fileSize: true }
  });
}

async function run() {
  const options = parseArgs();
  const prisma = new PrismaClient();

  const missing: MissingTrack[] = [];
  let processed = 0;

  try {
    let chunk: TrackRecord[];
    do {
      chunk = await scanChunk(prisma, processed, options.chunk);
      processed += chunk.length;

      for (const track of chunk) {
        if (!track.filePath) continue;
        if (!fs.existsSync(track.filePath)) {
          missing.push(track);
        }
      }
      if (chunk.length === 0) break;
    } while (chunk.length === options.chunk);

    console.log(`Scanned ${processed} tracks. Missing files for ${missing.length} tracks.`);

    if (missing.length && options.json) {
      const payload = {
        generatedAt: new Date().toISOString(),
        totalMissing: missing.length,
        tracks: missing
      };
      fs.writeFileSync(options.json, JSON.stringify(payload, null, 2));
      console.log(`Wrote report to ${options.json}`);
    }

    if (!options.apply) {
      for (const track of missing.slice(0, 20)) {
        console.log(`- ${track.id}: ${track.title} -> ${track.filePath}`);
      }
      if (missing.length > 20) {
        console.log(`...and ${missing.length - 20} more.`);
      }
      console.log('Dry run complete. Use --apply to null filePath/fileSize.');
      return;
    }

    let updated = 0;
    for (const track of missing) {
      await prisma.track.update({
        where: { id: track.id },
        data: { filePath: null, fileSize: null }
      });
      updated++;
      if (updated % 50 === 0) {
        console.log(`Updated ${updated}/${missing.length}`);
      }
    }
    console.log(`Updated ${updated} tracks. All missing file paths set to null.`);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

run();
