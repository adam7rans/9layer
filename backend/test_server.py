#!/usr/bin/env python3

import uvicorn
from fastapi import FastAPI

# Simple test server
app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Test server working"}

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    print("Starting test server...")
    uvicorn.run(app, host="127.0.0.1", port=8001, log_level="debug")