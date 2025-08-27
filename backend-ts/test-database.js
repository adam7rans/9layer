const { PrismaClient } = require('@prisma/client');

async function testDatabase() {
  const prisma = new PrismaClient();
  
  try {
    console.log('🔍 Testing database connection...');
    
    // Test 1: Create an artist
    console.log('\n1. Creating test artist...');
    const artist = await prisma.artist.create({
      data: {
        name: 'Test Artist'
      }
    });
    console.log('✅ Artist created:', artist);
    
    // Test 2: Create an album
    console.log('\n2. Creating test album...');
    const album = await prisma.album.create({
      data: {
        title: 'Test Album',
        artistId: artist.id,
        albumType: 'ALBUM'
      }
    });
    console.log('✅ Album created:', album);
    
    // Test 3: Create a track
    console.log('\n3. Creating test track...');
    const track = await prisma.track.create({
      data: {
        title: 'Test Track',
        artistId: artist.id,
        albumId: album.id,
        duration: 180,
        filePath: '/test/path/track.mp3',
        fileSize: 5242880,
        youtubeId: 'test-youtube-id',
        likeability: 5
      }
    });
    console.log('✅ Track created:', track);
    
    // Test 4: Query with relations
    console.log('\n4. Querying track with relations...');
    const trackWithRelations = await prisma.track.findUnique({
      where: { id: track.id },
      include: {
        artist: true,
        album: true
      }
    });
    console.log('✅ Track with relations:', trackWithRelations);
    
    // Test 5: Update track
    console.log('\n5. Updating track likeability...');
    const updatedTrack = await prisma.track.update({
      where: { id: track.id },
      data: { likeability: 8 }
    });
    console.log('✅ Track updated:', updatedTrack);
    
    // Test 6: Count records
    console.log('\n6. Counting records...');
    const counts = {
      artists: await prisma.artist.count(),
      albums: await prisma.album.count(),
      tracks: await prisma.track.count()
    };
    console.log('✅ Record counts:', counts);
    
    // Test 7: Delete records (cleanup)
    console.log('\n7. Cleaning up test data...');
    await prisma.track.delete({ where: { id: track.id } });
    await prisma.album.delete({ where: { id: album.id } });
    await prisma.artist.delete({ where: { id: artist.id } });
    console.log('✅ Test data cleaned up');
    
    console.log('\n🎉 All database tests passed!');
    
  } catch (error) {
    console.error('❌ Database test failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

testDatabase();
