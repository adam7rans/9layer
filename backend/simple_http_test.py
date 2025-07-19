#!/usr/bin/env python3

import http.server
import socketserver
import threading

PORT = 8000

class MyHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/health':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"status": "ok"}')
        else:
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(b'{"message": "Simple server working"}')

def start_server():
    with socketserver.TCPServer(("", PORT), MyHandler) as httpd:
        print(f"✅ Simple HTTP server started on port {PORT}")
        httpd.serve_forever()

if __name__ == "__main__":
    print("Starting simple HTTP server...")
    server_thread = threading.Thread(target=start_server, daemon=True)
    server_thread.start()
    
    import time
    time.sleep(1)
    
    # Test the server
    import urllib.request
    try:
        response = urllib.request.urlopen('http://localhost:8000/health')
        print(f"✅ Server responding: {response.read().decode()}")
    except Exception as e:
        print(f"❌ Server not responding: {e}")
    
    input("Press Enter to stop server...")