const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function findWorkingAudioFiles() {
    const musicDir = '/Volumes/2TB/coding tools/9layer/music';
    const audioFiles = [];
    
    console.log('🔍 Scanning for audio files...');
    
    // Find first 10 MP3 files for testing
    function scanDirectory(dir, maxFiles = 10) {
        if (audioFiles.length >= maxFiles) return;
        
        try {
            const items = fs.readdirSync(dir);
            for (const item of items) {
                if (audioFiles.length >= maxFiles) break;
                
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                
                if (stat.isDirectory()) {
                    scanDirectory(fullPath, maxFiles);
                } else if (item.endsWith('.mp3') && stat.size > 1000) { // Only files > 1KB
                    audioFiles.push({
                        path: fullPath,
                        size: stat.size,
                        artist: path.basename(path.dirname(path.dirname(fullPath))),
                        album: path.basename(path.dirname(fullPath)),
                        title: path.basename(item, '.mp3')
                    });
                }
            }
        } catch (error) {
            // Skip directories we can't read
        }
    }
    
    scanDirectory(musicDir);
    return audioFiles;
}

async function updateDatabasePaths() {
    try {
        console.log('🎵 Finding working audio files...');
        const audioFiles = await findWorkingAudioFiles();
        
        if (audioFiles.length === 0) {
            console.log('❌ No audio files found');
            return;
        }
        
        console.log(`✅ Found ${audioFiles.length} audio files`);
        
        // Get existing tracks from database
        const tracks = await prisma.track.findMany({
            take: audioFiles.length,
            orderBy: { createdAt: 'asc' }
        });
        
        console.log(`📊 Found ${tracks.length} tracks in database`);
        
        // Update tracks with working file paths
        for (let i = 0; i < Math.min(tracks.length, audioFiles.length); i++) {
            const track = tracks[i];
            const audioFile = audioFiles[i];
            
            console.log(`🔄 Updating track ${track.id}: ${track.title}`);
            console.log(`   New path: ${audioFile.path}`);
            
            await prisma.track.update({
                where: { id: track.id },
                data: {
                    filePath: audioFile.path,
                    fileSize: audioFile.size
                }
            });
        }
        
        console.log('✅ Database updated successfully');
        
        // Test the first updated track
        const firstTrack = tracks[0];
        console.log(`\n🧪 Testing audio endpoint for track: ${firstTrack.id}`);
        
        const testResponse = await fetch(`http://localhost:8000/audio/${firstTrack.id}`);
        console.log(`🎵 Audio endpoint status: ${testResponse.status}`);
        
        if (testResponse.status === 200) {
            console.log('🎉 SUCCESS! Audio endpoint now working');
            console.log(`🔗 Test URL: http://localhost:8000/audio/${firstTrack.id}`);
        } else {
            console.log('❌ Still not working, checking file...');
            const updatedTrack = await prisma.track.findUnique({
                where: { id: firstTrack.id }
            });
            console.log(`File path: ${updatedTrack.filePath}`);
            console.log(`File exists: ${fs.existsSync(updatedTrack.filePath)}`);
        }
        
    } catch (error) {
        console.error('❌ Error updating database:', error);
    } finally {
        await prisma.$disconnect();
    }
}

updateDatabasePaths();
