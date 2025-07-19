#!/usr/bin/env python3

import asyncio
import websockets
import json

async def test_websocket():
    uri = "ws://localhost:8000/api/ws"
    print(f"Attempting to connect to {uri}")
    
    try:
        async with websockets.connect(uri) as websocket:
            print("✅ WebSocket connected successfully!")
            
            # Wait for initial messages
            try:
                message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"📦 Received: {message}")
                
                # Try to receive another message
                message = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"📦 Received: {message}")
                
                # Send a test message
                test_msg = {"type": "play", "data": {}}
                await websocket.send(json.dumps(test_msg))
                print(f"📤 Sent: {test_msg}")
                
                # Wait for response
                response = await asyncio.wait_for(websocket.recv(), timeout=5.0)
                print(f"📦 Response: {response}")
                
            except asyncio.TimeoutError:
                print("⏰ Timeout waiting for messages")
            
    except Exception as e:
        print(f"❌ WebSocket connection failed: {e}")

if __name__ == "__main__":
    asyncio.run(test_websocket())