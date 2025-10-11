#!/usr/bin/env bash
set -euo pipefail

SOURCE="${BASH_SOURCE[0]}"
while [ -h "$SOURCE" ]; do
  DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"
  SOURCE="$(readlink "$SOURCE")"
  [[ $SOURCE != /* ]] && SOURCE="$DIR/$SOURCE"
done
ROOT_DIR="$(cd -P "$(dirname "$SOURCE")" && pwd)"

stop_servers() {
  echo "Stopping 9layer dev servers..."
  pkill -f "tsx watch src/app.ts" >/dev/null 2>&1 || true
  pkill -f "next dev" >/dev/null 2>&1 || true
  echo "Done."
}

if [[ "${1:-}" == "end" ]]; then
  stop_servers
  exit 0
fi
port_in_use() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    if lsof -PiTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      return 0
    fi
  fi
  return 1
}

# Auto-find available backend port
if [ -z "${BACKEND_PORT+x}" ]; then
  BACKEND_PORT=8000
  while port_in_use "$BACKEND_PORT"; do
    BACKEND_PORT=$((BACKEND_PORT + 1))
  done
else
  # User explicitly set BACKEND_PORT, ensure it's free
  if port_in_use "$BACKEND_PORT"; then
    printf "Error: port %s is already in use. Please stop the process using it or choose a different BACKEND_PORT.\n" "$BACKEND_PORT"
    exit 1
  fi
fi

# Auto-find available frontend port
if [ -z "${FRONTEND_PORT+x}" ]; then
  FRONTEND_PORT=3000
  while port_in_use "$FRONTEND_PORT"; do
    FRONTEND_PORT=$((FRONTEND_PORT + 1))
  done
else
  # User explicitly set FRONTEND_PORT, ensure it's free
  if port_in_use "$FRONTEND_PORT"; then
    printf "Error: port %s is already in use. Please stop the process using it or choose a different FRONTEND_PORT.\n" "$FRONTEND_PORT"
    exit 1
  fi
fi

BACKEND_URL="http://localhost:${BACKEND_PORT}"
FRONTEND_URL="http://localhost:${FRONTEND_PORT}"

printf "\nStarting 9layer development environment...\n\n"
printf "Backend:  %s\n" "$BACKEND_URL"
printf "Frontend: %s\n" "$FRONTEND_URL"
printf "\nPress Ctrl+C to stop both servers.\n\n"

declare -a PIDS

cleanup() {
  printf "\nShutting down 9layer servers...\n"
  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" >/dev/null 2>&1; then
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done
}
trap cleanup EXIT

(
  cd "$ROOT_DIR/backend"
  printf "[backend] npm run dev (PORT=%s)\n" "$BACKEND_PORT"
  PORT="$BACKEND_PORT" npm run dev
) &
PIDS+=($!)

(
  cd "$ROOT_DIR/frontend"
  printf "[frontend] npm run dev -- --port %s\n" "$FRONTEND_PORT"
  npm run dev -- --port "$FRONTEND_PORT"
) &
PIDS+=($!)

wait
