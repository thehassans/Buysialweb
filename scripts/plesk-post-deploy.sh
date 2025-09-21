#!/usr/bin/env bash
# Plesk Git post-deploy script (Linux)
# - Installs backend deps (production)
# - Builds frontend
# - Ensures runtime dirs exist
# - Restarts Node app (Passenger) by touching tmp/restart.txt

set -euo pipefail

# Resolve repo root relative to this script (repo/scripts/plesk-post-deploy.sh)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
FRONTEND_DIR="$ROOT_DIR/frontend"

echo "[deploy] Repo root: $ROOT_DIR"

# Ensure Node and npm exist
if ! command -v node >/dev/null 2>&1; then
  echo "[deploy] ERROR: node is not available in PATH" >&2
  exit 1
fi
if ! command -v npm >/dev/null 2>&1; then
  echo "[deploy] ERROR: npm is not available in PATH" >&2
  exit 1
fi

# Backend: install production dependencies only
if [ -d "$BACKEND_DIR" ]; then
  echo "[deploy] Installing backend deps (production)..."
  ( cd "$BACKEND_DIR" && npm ci --omit=dev )
  echo "[deploy] Ensuring runtime directories..."
  mkdir -p "$BACKEND_DIR/uploads" || true
  mkdir -p "$BACKEND_DIR/wa_auth" || true
else
  echo "[deploy] WARN: backend directory not found at $BACKEND_DIR"
fi

# Frontend: install and build
if [ -d "$FRONTEND_DIR" ]; then
  echo "[deploy] Installing frontend deps..."
  ( cd "$FRONTEND_DIR" && npm ci )
  echo "[deploy] Building frontend..."
  ( cd "$FRONTEND_DIR" && npm run build )
else
  echo "[deploy] WARN: frontend directory not found at $FRONTEND_DIR"
fi

# Restart Node app (Passenger)
if [ -d "$BACKEND_DIR" ]; then
  echo "[deploy] Restarting Node app via Passenger tmp/restart.txt..."
  mkdir -p "$BACKEND_DIR/tmp"
  date +%s > "$BACKEND_DIR/tmp/restart.txt"
fi

echo "[deploy] Done."
