#!/usr/bin/env bash
set -Eeuo pipefail

log(){ echo "[deploy] $(date +"%Y-%m-%d %H:%M:%S") - $*"; }
err(){ echo "[deploy] ERROR: $*" >&2; }

# Run from repo root (script is in scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

log "Repo root: $REPO_ROOT"
log "Node: $(node -v 2>/dev/null || echo 'missing') | npm: $(npm -v 2>/dev/null || echo 'missing')"

export NODE_ENV=production

# Install backend deps (production only)
if [ -d "backend" ]; then
  log "Installing backend dependencies (production)"
  (cd backend && npm ci --omit=dev)
else
  err "backend/ directory not found"
fi

# Build frontend
if [ -d "frontend" ]; then
  log "Installing frontend dependencies"
  (cd frontend && npm ci)
  log "Building frontend"
  (cd frontend && npm run build)
  # Print absolute dist path to help configure FRONTEND_DIST
  if [ -d "frontend/dist" ]; then
    DIST_ABS="$(cd frontend/dist && pwd)"
    log "Frontend built at: $DIST_ABS"
    echo "[deploy] TIP: Set FRONTEND_DIST=$DIST_ABS in Plesk env if not already set."
  fi
else
  err "frontend/ directory not found"
fi

log "Deployment tasks completed. Trigger a request to your site or click 'Restart App' in Plesk if needed."
