#!/usr/bin/env python3

from fastapi import FastAPI
import uvicorn

app = FastAPI()

@app.get("/")
async def root():
    return {"message": "Minimal test server working"}

@app.get("/health")
async def health():
    return {"status": "ok"}

if __name__ == "__main__":
    print("Starting minimal test server...")
    uvicorn.run(app, host="127.0.0.1", port=8080, log_level="debug")