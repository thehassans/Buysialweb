# Plesk Git Auto-Deploy (Production + Staging)

This repo includes a robust post-deployment script to automatically build and deploy the frontend to your Plesk docroot on each push. No SSH steps are required after initial setup.

## Domains and branches
- Production: `web.buysial.com` ← branch `main`
- Staging: `dev.web.buysial.com` ← branch `dev`

## Post-deploy script
- Script path: `scripts/plesk-post-deploy.sh`
- Usage:
  - Auto-detect env from branch (main → production, dev → staging)
  - Or pass an explicit argument: `bash scripts/plesk-post-deploy.sh production` or `bash scripts/plesk-post-deploy.sh staging`

What it does:
- Installs backend dependencies (omit dev) if `backend/` exists
- Installs frontend dependencies and runs `npm run build`
- Rsyncs `frontend/dist/` to the appropriate document root

## Default docroots (adjust if needed)
- Production: `/var/www/vhosts/web.buysial.com/httpdocs`
- Staging: `/var/www/vhosts/dev.web.buysial.com/httpdocs`

You can override via environment variables in Plesk Git settings:
- `DOCROOT` (overrides both)
- `PROD_DOCROOT` (production only)
- `STAGE_DOCROOT` (staging only)

## Plesk setup (one-time)
1. In Plesk, open: Websites & Domains → [domain] → Git
2. Connect the repository (GitHub HTTPS URL), choose the branch:
   - Production domain → `main`
   - Staging domain → `dev`
3. Deployment mode: Automatic deployment on push
4. Custom deployment action:
   - Production: `bash scripts/plesk-post-deploy.sh production`
   - Staging: `bash scripts/plesk-post-deploy.sh staging`
5. Environment variables (optional, only if your docroot differs):
   - `PROD_DOCROOT=/your/custom/prod/docroot`
   - `STAGE_DOCROOT=/your/custom/stage/docroot`

## Node version on server
- Ensure Node LTS (18 or 20) is available to the Plesk environment.
- The script logs Node and npm versions at start for quick diagnostics.

## Frontend API configuration
- By default, dev builds point to `http://localhost:4000` when running locally.
- For production/staging builds, set `VITE_API_BASE` in the environment (or `.env.production` if your Plesk environment sources it):
  - Example: `VITE_API_BASE=https://web.buysial.com`

See `frontend/.env.production.example` for a sample file.

## CDN / cache
- If a CDN (e.g. Cloudflare) is used, purge cache after deployment.

## Troubleshooting
- Check the Plesk Git tab logs after push.
- SSH and run manually if needed:
  ```bash
  bash scripts/plesk-post-deploy.sh production
  # or
  bash scripts/plesk-post-deploy.sh staging
  ```
- If the frontend didn’t update, verify docroot paths and Node availability.
