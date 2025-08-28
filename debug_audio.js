const fs = require('fs');

async function testAudioEndpoint() {
    const audioUrl = 'http://localhost:8000/audio/5cswwkz8sAQ';
    
    console.log('🔍 Testing audio endpoint connectivity...\n');
    
    try {
        // Test 1: HEAD request
        console.log('1. Testing HEAD request...');
        const headResponse = await fetch(audioUrl, { method: 'HEAD' });
        console.log(`   Status: ${headResponse.status}`);
        console.log(`   Content-Type: ${headResponse.headers.get('content-type')}`);
        console.log(`   Content-Length: ${headResponse.headers.get('content-length')}`);
        console.log(`   CORS Origin: ${headResponse.headers.get('access-control-allow-origin')}`);
        console.log(`   Accept-Ranges: ${headResponse.headers.get('accept-ranges')}\n`);
        
        // Test 2: Partial GET request
        console.log('2. Testing partial GET request (first 1KB)...');
        const partialResponse = await fetch(audioUrl, {
            headers: { 'Range': 'bytes=0-1023' }
        });
        console.log(`   Status: ${partialResponse.status}`);
        console.log(`   Content-Range: ${partialResponse.headers.get('content-range')}`);
        
        if (partialResponse.ok) {
            const buffer = await partialResponse.buffer();
            console.log(`   Received ${buffer.length} bytes`);
            console.log(`   First 16 bytes: ${buffer.slice(0, 16).toString('hex')}\n`);
        }
        
        // Test 3: Check if it's a valid audio file
        console.log('3. Checking audio file validity...');
        const fullResponse = await fetch(audioUrl);
        if (fullResponse.ok) {
            const audioBuffer = await fullResponse.buffer();
            
            // Check for MP3 header
            const header = audioBuffer.slice(0, 3).toString();
            if (header === 'ID3' || audioBuffer[0] === 0xFF) {
                console.log('   ✅ Valid MP3 file detected');
            } else {
                console.log('   ⚠️  Unexpected file format');
                console.log(`   Header bytes: ${audioBuffer.slice(0, 10).toString('hex')}`);
            }
            
            console.log(`   File size: ${audioBuffer.length} bytes`);
        }
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    }
}

async function testTrackDatabase() {
    console.log('\n🗄️  Testing track database...\n');
    
    try {
        const tracksResponse = await fetch('http://localhost:8000/tracks?limit=1');
        if (tracksResponse.ok) {
            const data = await tracksResponse.json();
            if (data.success && data.tracks.length > 0) {
                const track = data.tracks[0];
                console.log(`Sample track: ${track.title} by ${track.artist}`);
                console.log(`Track ID: ${track.id}`);
                console.log(`File path: ${track.filePath}`);
                
                // Check if file exists on disk
                if (fs.existsSync(track.filePath)) {
                    console.log('✅ File exists on disk');
                    const stats = fs.statSync(track.filePath);
                    console.log(`File size: ${stats.size} bytes`);
                } else {
                    console.log('❌ File does not exist on disk');
                }
            }
        }
    } catch (error) {
        console.error('❌ Database test failed:', error.message);
    }
}

// Run tests
testAudioEndpoint().then(() => testTrackDatabase());
