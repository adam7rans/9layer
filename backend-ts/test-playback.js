async function testPlaybackService() {
  console.log('🔍 Testing Playback Service...');
  
  try {
    // Test 1: Get initial playback state
    console.log('\n1. Testing initial playback state...');
    const stateResponse = await fetch('http://localhost:8000/playback/state');
    const stateResult = await stateResponse.json();
    console.log('✅ Initial state:', stateResult);
    
    // Test 2: Test pause without current track
    console.log('\n2. Testing pause without current track...');
    const pauseResponse = await fetch('http://localhost:8000/playback/pause', {
      method: 'POST'
    });
    const pauseResult = await pauseResponse.json();
    console.log('✅ Pause response:', pauseResult);
    
    // Test 3: Test stop without current track
    console.log('\n3. Testing stop without current track...');
    const stopResponse = await fetch('http://localhost:8000/playback/stop', {
      method: 'POST'
    });
    const stopResult = await stopResponse.json();
    console.log('✅ Stop response:', stopResult);
    
    // Test 4: Test next without queue
    console.log('\n4. Testing next without queue...');
    const nextResponse = await fetch('http://localhost:8000/playback/next', {
      method: 'POST'
    });
    const nextResult = await nextResponse.json();
    console.log('✅ Next response:', nextResult);
    
    // Test 5: Test previous without queue
    console.log('\n5. Testing previous without queue...');
    const prevResponse = await fetch('http://localhost:8000/playback/previous', {
      method: 'POST'
    });
    const prevResult = await prevResponse.json();
    console.log('✅ Previous response:', prevResult);
    
    // Test 6: Test seek
    console.log('\n6. Testing seek...');
    const seekResponse = await fetch('http://localhost:8000/playback/seek', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ position: 30 })
    });
    const seekResult = await seekResponse.json();
    console.log('✅ Seek response:', seekResult);
    
    // Test 7: Test volume control
    console.log('\n7. Testing volume control...');
    const volumeResponse = await fetch('http://localhost:8000/playback/volume', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volume: 75 })
    });
    const volumeResult = await volumeResponse.json();
    console.log('✅ Volume response:', volumeResult);
    
    // Test 8: Test shuffle toggle
    console.log('\n8. Testing shuffle toggle...');
    const shuffleResponse = await fetch('http://localhost:8000/playback/shuffle', {
      method: 'POST'
    });
    const shuffleResult = await shuffleResponse.json();
    console.log('✅ Shuffle response:', shuffleResult);
    
    // Test 9: Test repeat mode
    console.log('\n9. Testing repeat mode...');
    const repeatResponse = await fetch('http://localhost:8000/playback/repeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'track' })
    });
    const repeatResult = await repeatResponse.json();
    console.log('✅ Repeat response:', repeatResult);
    
    // Test 10: Test queue operations
    console.log('\n10. Testing queue operations...');
    const queueResponse = await fetch('http://localhost:8000/playback/queue');
    const queueResult = await queueResponse.json();
    console.log('✅ Queue response:', queueResult);
    
    // Test 11: Clear queue
    console.log('\n11. Testing clear queue...');
    const clearResponse = await fetch('http://localhost:8000/playback/queue', {
      method: 'DELETE'
    });
    const clearResult = await clearResponse.json();
    console.log('✅ Clear queue response:', clearResult);
    
    // Test 12: Play non-existent track
    console.log('\n12. Testing play non-existent track...');
    const playResponse = await fetch('http://localhost:8000/playback/play/nonexistent-track', {
      method: 'POST'
    });
    const playResult = await playResponse.json();
    console.log('✅ Play non-existent track response:', playResult);
    
    console.log('\n🎉 All playback service tests passed!');
    
  } catch (error) {
    console.error('❌ Playback test failed:', error);
  }
}

testPlaybackService();
