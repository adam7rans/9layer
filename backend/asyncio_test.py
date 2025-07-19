#!/usr/bin/env python3

import asyncio
import socket

async def test_asyncio_server():
    async def handle_client(reader, writer):
        print("Client connected!")
        data = await reader.read(1024)
        message = b"HTTP/1.1 200 OK\r\nContent-Length: 15\r\n\r\n{\"status\":\"ok\"}"
        writer.write(message)
        await writer.drain()
        writer.close()
        await writer.wait_closed()

    try:
        server = await asyncio.start_server(
            handle_client, '127.0.0.1', 8000
        )
        print("✅ Asyncio server started on 127.0.0.1:8000")
        
        # Test the server
        await asyncio.sleep(1)
        
        async with server:
            await server.serve_forever()
            
    except Exception as e:
        print(f"❌ Asyncio server failed: {e}")

def test_blocking_server():
    """Test with blocking socket server"""
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        sock.bind(('127.0.0.1', 8001))
        sock.listen(1)
        print("✅ Blocking server started on 127.0.0.1:8001")
        
        while True:
            conn, addr = sock.accept()
            print(f"Connection from {addr}")
            data = conn.recv(1024)
            response = b"HTTP/1.1 200 OK\r\nContent-Length: 15\r\n\r\n{\"status\":\"ok\"}"
            conn.send(response)
            conn.close()
            break
            
    except Exception as e:
        print(f"❌ Blocking server failed: {e}")
    finally:
        sock.close()

if __name__ == "__main__":
    print("Testing blocking server first...")
    test_blocking_server()
    
    print("\nTesting asyncio server...")
    try:
        asyncio.run(test_asyncio_server())
    except KeyboardInterrupt:
        print("Server stopped")