import asyncio
import websockets
import json

async def test_websocket():
    uri = "ws://localhost:8000/api/ws"
    try:
        async with websockets.connect(uri) as websocket:
            print(f"Connected to {uri}")
            
            # Send a test message
            test_message = "Hello from Python client"
            print(f"Sending: {test_message}")
            await websocket.send(test_message)
            
            # Receive and print messages
            while True:
                response = await websocket.recv()
                print(f"Received: {response}")
                
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    # Install websockets package if not already installed
    try:
        import websockets
    except ImportError:
        import sys
        import subprocess
        print("Installing websockets package...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "websockets"])
        import websockets
    
    asyncio.get_event_loop().run_until_complete(test_websocket())
