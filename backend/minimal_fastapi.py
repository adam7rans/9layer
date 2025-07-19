#!/usr/bin/env python3

from fastapi import FastAPI
import uvicorn

# Minimal FastAPI app without any database or complex dependencies
app = FastAPI(title="Minimal FastAPI Test")

@app.get("/")
async def root():
    return {"message": "Minimal FastAPI working"}

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.get("/test")
async def test():
    return {"test": "working"}

if __name__ == "__main__":
    print("Starting minimal FastAPI server...")
    uvicorn.run(
        app, 
        host="127.0.0.1",
        port=8000,
        log_level="debug",
        access_log=True
    )