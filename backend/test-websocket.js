const WebSocket = require('ws');

async function testWebSocketService() {
  console.log('🔍 Testing WebSocket Service...');
  
  return new Promise((resolve, reject) => {
    try {
      // Test WebSocket connection
      console.log('\n1. Testing WebSocket connection...');
      const ws = new WebSocket('ws://localhost:8000/ws');
      
      let receivedWelcome = false;
      let clientId = null;
      
      ws.on('open', () => {
        console.log('✅ WebSocket connection established');
      });
      
      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log('📨 Received message:', message);
          
          if (message.type === 'welcome') {
            receivedWelcome = true;
            clientId = message.payload.clientId;
            console.log('✅ Welcome message received, clientId:', clientId);
            
            // Test ping command
            console.log('\n2. Testing ping command...');
            ws.send(JSON.stringify({
              type: 'command',
              payload: { action: 'ping' },
              timestamp: new Date()
            }));
          }
          
          if (message.type === 'pong') {
            console.log('✅ Pong response received');
            
            // Test status command
            console.log('\n3. Testing status command...');
            ws.send(JSON.stringify({
              type: 'command',
              payload: { action: 'getStatus' },
              timestamp: new Date()
            }));
          }
          
          if (message.type === 'status') {
            console.log('✅ Status response received:', message.payload);
            
            // Test invalid command
            console.log('\n4. Testing invalid command...');
            ws.send(JSON.stringify({
              type: 'command',
              payload: { action: 'invalidCommand' },
              timestamp: new Date()
            }));
          }
          
          if (message.type === 'error' && message.payload.command === 'invalidCommand') {
            console.log('✅ Error response for invalid command:', message.payload);
            
            console.log('\n🎉 All WebSocket tests passed!');
            ws.close();
            resolve();
          }
          
        } catch (error) {
          console.error('❌ Error parsing WebSocket message:', error);
          reject(error);
        }
      });
      
      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error);
        reject(error);
      });
      
      ws.on('close', () => {
        console.log('🔌 WebSocket connection closed');
        if (receivedWelcome) {
          resolve();
        }
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (!receivedWelcome) {
          console.error('❌ WebSocket test timeout');
          ws.close();
          reject(new Error('WebSocket test timeout'));
        }
      }, 10000);
      
    } catch (error) {
      console.error('❌ WebSocket test failed:', error);
      reject(error);
    }
  });
}

testWebSocketService().catch(console.error);
