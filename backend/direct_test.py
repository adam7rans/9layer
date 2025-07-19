#!/usr/bin/env python3

import asyncio
import socket
from fastapi import FastAPI

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Direct test working"}

@app.get("/health")
async def health():
    return {"status": "ok"}

async def run_server():
    import uvicorn
    config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=8000,
        log_level="debug"
    )
    server = uvicorn.Server(config)
    
    print("Starting server with direct asyncio...")
    await server.serve()

def test_socket_first():
    # Test if we can bind the socket manually
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(('127.0.0.1', 8000))
        sock.listen(1)
        print("✅ Socket bind successful")
        sock.close()
    except Exception as e:
        print(f"❌ Socket bind failed: {e}")
        return False
    return True

if __name__ == "__main__":
    if test_socket_first():
        try:
            asyncio.run(run_server())
        except Exception as e:
            print(f"❌ Asyncio server failed: {e}")
    else:
        print("❌ Basic socket test failed")