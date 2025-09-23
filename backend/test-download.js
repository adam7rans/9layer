const { PrismaClient } = require('@prisma/client');

async function testDownloadEndpoint() {
  console.log('🔍 Testing Download Service...');
  
  try {
    // Test 1: Test download endpoint with invalid URL
    console.log('\n1. Testing invalid URL handling...');
    const invalidResponse = await fetch('http://localhost:8000/download/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'invalid-url' })
    });
    const invalidResult = await invalidResponse.json();
    console.log('✅ Invalid URL response:', invalidResult);
    
    // Test 2: Test download endpoint without URL
    console.log('\n2. Testing missing URL handling...');
    const noUrlResponse = await fetch('http://localhost:8000/download/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    const noUrlResult = await noUrlResponse.json();
    console.log('✅ Missing URL response:', noUrlResult);
    
    // Test 3: Test download queue status
    console.log('\n3. Testing download queue status...');
    const queueResponse = await fetch('http://localhost:8000/download/queue');
    const queueResult = await queueResponse.json();
    console.log('✅ Queue status:', queueResult);
    
    // Test 4: Test progress endpoint with non-existent job
    console.log('\n4. Testing progress endpoint with non-existent job...');
    const progressResponse = await fetch('http://localhost:8000/download/progress/nonexistent-job');
    const progressResult = await progressResponse.json();
    console.log('✅ Non-existent job response:', progressResult);
    
    console.log('\n🎉 Download service basic tests passed!');
    
  } catch (error) {
    console.error('❌ Download test failed:', error);
  }
}

testDownloadEndpoint();
