const fs = require('fs');

async function testWithWorkingFile() {
    // Test with a file that actually exists
    const testFilePath = '/Volumes/2TB/coding tools/9layer/music/Helmet/Meantime/Role Model.mp3';
    
    console.log('🎵 Testing with existing audio file...\n');
    
    // Check if file exists
    if (fs.existsSync(testFilePath)) {
        const stats = fs.statSync(testFilePath);
        console.log(`✅ File exists: ${testFilePath}`);
        console.log(`📁 File size: ${stats.size} bytes`);
        
        // Read first few bytes to verify it's an MP3
        const buffer = fs.readFileSync(testFilePath, { start: 0, end: 10 });
        console.log(`🔍 File header: ${buffer.toString('hex')}`);
        
        if (buffer[0] === 0xFF || buffer.toString('ascii', 0, 3) === 'ID3') {
            console.log('✅ Valid MP3 file detected');
        } else {
            console.log('⚠️  Unexpected file format');
        }
    } else {
        console.log('❌ File does not exist');
    }
    
    // Test the backend with this file by updating a track temporarily
    console.log('\n🔄 Testing backend with working file...');
    
    try {
        // Get a track from the database
        const tracksResponse = await fetch('http://localhost:8000/tracks?limit=1');
        if (tracksResponse.ok) {
            const data = await tracksResponse.json();
            if (data.success && data.tracks.length > 0) {
                const trackId = data.tracks[0].id;
                console.log(`🎯 Testing with track ID: ${trackId}`);
                
                // Test the audio endpoint (this will fail because the file path is wrong)
                const audioResponse = await fetch(`http://localhost:8000/audio/${trackId}`);
                console.log(`🎵 Audio endpoint status: ${audioResponse.status}`);
                
                if (audioResponse.status === 404) {
                    console.log('❌ Expected 404 - file path in database is incorrect');
                } else if (audioResponse.status === 200) {
                    console.log('✅ Audio endpoint working!');
                }
            }
        }
    } catch (error) {
        console.error('❌ Backend test failed:', error.message);
    }
}

testWithWorkingFile();
