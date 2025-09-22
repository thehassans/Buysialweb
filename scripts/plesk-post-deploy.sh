#!/usr/bin/env bash
set -Eeuo pipefail

log(){ echo "[deploy] $(date +"%Y-%m-%d %H:%M:%S") - $*"; }
err(){ echo "[deploy] ERROR: $*" >&2; }

# Usage: scripts/plesk-post-deploy.sh [production|staging]
# If no argument passed, ENV can be set via environment; otherwise auto-detect from Git branch (main=>production, dev=>staging)

# Run from repo root (script is in scripts/)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo '')"
ENV_ARG="${1:-}"
ENV_VAL="${ENV:-}"  # allow overriding via ENV

if [[ -z "$ENV_ARG" && -z "$ENV_VAL" ]]; then
  case "$BRANCH" in
    main) ENV_VAL=production ;;
    dev)  ENV_VAL=staging ;;
    *)    ENV_VAL=production ;;
  esac
fi

ENVIRONMENT="${ENV_ARG:-$ENV_VAL}"
if [[ "$ENVIRONMENT" != "production" && "$ENVIRONMENT" != "staging" ]]; then
  err "Unknown environment: '$ENVIRONMENT'. Use 'production' or 'staging'."
  exit 2
fi

log "Repo root: $REPO_ROOT (branch: ${BRANCH:-unknown})"
log "Environment: $ENVIRONMENT"
log "Node: $(node -v 2>/dev/null || echo 'missing') | npm: $(npm -v 2>/dev/null || echo 'missing')"

export NODE_ENV=production

# Resolve DOCROOT
# Allow explicit DOCROOT env. Otherwise use PROD_DOCROOT / STAGE_DOCROOT; fallback to known defaults per memory.
DEFAULT_PROD_DOCROOT="/var/www/vhosts/web.buysial.com/httpdocs"
DEFAULT_STAGE_DOCROOT="/var/www/vhosts/dev.web.buysial.com/httpdocs"

if [[ "${DOCROOT:-}" != "" ]]; then
  TARGET_DOCROOT="$DOCROOT"
else
  if [[ "$ENVIRONMENT" == "production" ]]; then
    TARGET_DOCROOT="${PROD_DOCROOT:-$DEFAULT_PROD_DOCROOT}"
  else
    TARGET_DOCROOT="${STAGE_DOCROOT:-$DEFAULT_STAGE_DOCROOT}"
  fi
fi

log "Target docroot: $TARGET_DOCROOT"
if [[ ! -d "$TARGET_DOCROOT" ]]; then
  err "Docroot does not exist: $TARGET_DOCROOT"
  exit 3
fi

# Optional: Install backend deps (no dev deps). Skips if backend missing.
if [ -d "backend" ]; then
  log "Installing backend dependencies (omit dev)"
  (cd backend && npm ci --omit=dev)
else
  log "(skip) backend/ directory not found"
fi

# Build frontend
if [ -d "frontend" ]; then
  log "Installing frontend dependencies"
  (cd frontend && npm ci)
  log "Building frontend"
  (cd frontend && npm run build)
  if [ -d "frontend/dist" ]; then
    DIST_ABS="$(cd frontend/dist && pwd)"
    log "Built frontend at: $DIST_ABS"
    log "Deploying to $TARGET_DOCROOT (rsync --delete)"
    rsync -a --delete \
      --exclude ".htaccess" \
      "$DIST_ABS"/ "$TARGET_DOCROOT"/
  else
    err "Build output not found at frontend/dist"
    exit 4
  fi
else
  err "frontend/ directory not found"
  exit 5
fi

log "Deployment complete. If you use Plesk Node app, click 'Restart App' if needed."
