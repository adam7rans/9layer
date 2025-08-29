const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);
const prisma = new PrismaClient();

/**
 * Extract duration from audio file using ffprobe
 */
async function getAudioDuration(filePath) {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`File not found: ${filePath}`);
      return null;
    }

    const command = `ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${filePath}"`;
    const { stdout } = await execAsync(command);
    const duration = parseFloat(stdout.trim());
    
    return isNaN(duration) ? null : Math.round(duration);
  } catch (error) {
    console.warn(`Failed to get duration for ${filePath}:`, error.message);
    return null;
  }
}

/**
 * Update track durations in database
 */
async function fixTrackDurations() {
  try {
    console.log('🎵 Starting track duration fix...');
    
    // Get all tracks with missing or zero duration
    const tracks = await prisma.track.findMany({
      where: {
        duration: 0
      },
      select: {
        id: true,
        title: true,
        filePath: true,
        duration: true
      }
    });

    console.log(`📊 Found ${tracks.length} tracks with missing duration`);

    let updated = 0;
    let failed = 0;

    for (const track of tracks) {
      console.log(`🔍 Processing: ${track.title}`);
      
      if (!track.filePath) {
        console.warn(`⚠️  No file path for track: ${track.title}`);
        failed++;
        continue;
      }

      const duration = await getAudioDuration(track.filePath);
      
      if (duration !== null) {
        await prisma.track.update({
          where: { id: track.id },
          data: { duration }
        });
        
        console.log(`✅ Updated ${track.title}: ${duration}s`);
        updated++;
      } else {
        console.warn(`❌ Failed to get duration for: ${track.title}`);
        failed++;
      }
    }

    console.log('\n📈 Summary:');
    console.log(`✅ Updated: ${updated} tracks`);
    console.log(`❌ Failed: ${failed} tracks`);
    console.log(`📊 Total processed: ${tracks.length} tracks`);

  } catch (error) {
    console.error('💥 Error fixing track durations:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the script
if (require.main === module) {
  fixTrackDurations();
}

module.exports = { fixTrackDurations, getAudioDuration };
