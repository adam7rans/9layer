tree -L 6 -I "music|NA|SFX"




# See if ports are open
lsof -i :8000
lsof -i :3000

# Kill processes on specific ports
lsof -ti :8000 | xargs kill -9
lsof -ti :3000 | xargs kill -9

# Kill by process name
pkill -f "python.*main.py"
pkill -f "npm.*dev"



lsof -ti :8000 | xargs kill -9; sleep 1; lsof -ti :8000 | xargs kill -9


ps aux | grep -E "python.*main.py|uvicorn" | grep -v grep | awk '{print $2}' | xargs kill -9











pkill -f "next-server"            # Next.js server