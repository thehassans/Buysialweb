# BuySial Commerce

A monorepo containing a Node.js (Express + MongoDB) backend and a React (Vite) frontend for Admin, User, and Agent panels. Includes initial scaffolding for WhatsApp (Baileys) integration.

## Structure

- `backend/` Express API with authentication, role-based access, admin user management, and placeholders for WhatsApp integration
- `frontend/` React app with Admin, User, and Agent panels, closeable sidebars, and basic dashboards

## Quick Start

1) Backend
- Copy `.env.example` to `.env` and set values
- Install dependencies and run server (commands below)

2) Frontend
- Install dependencies and run dev server (commands below)

## Environment

- Node.js 18+
- MongoDB 5+

## Backend Environment (.env)

```
PORT=4000
MONGO_URI=mongodb://localhost:27017/buysial
JWT_SECRET=supersecret_jwt_key_change_me
CORS_ORIGIN=http://localhost:5173
```

## Run Commands

Backend:
```
cd backend
npm install
npm run dev
```

Frontend:
```
cd frontend
npm install
npm run dev
```

Open:
- Frontend: http://localhost:5173
- Backend: http://localhost:4000

## Default Roles

- `admin`: Can create and list users
- `user`: Normal user access
- `agent`: Agent workspace (placeholder)

## Notes

- WhatsApp integration scaffolding is added. After installing `@whiskeysockets/baileys` and setting up the service, the QR connect and inbox will be functional.
- Graphs and metrics show placeholder values; connect to your real data sources to populate.

## Deploy on Plesk

1) Node.js App (Domains → Node.js)
- Application Root: `/httpdocs/backend`
- Application Startup File: `src/index.js`
- Application Mode: `production`
- Node.js Version: `18+`

2) Environment Variables (Domains → Node.js → Environment variables)
- `MONGO_URI` = your MongoDB/Atlas URI
- `DB_NAME` = optional override (else inferred from URI)
- `JWT_SECRET` = your strong secret
- `CORS_ORIGIN` = `https://yourdomain.com,https://www.yourdomain.com`
- `PUBLIC_BASE_URL` = `https://yourdomain.com`
- `ENABLE_WA` = `true` or `false` (enable WhatsApp routes)
- `USE_MEMORY_DB` = `false`
- `SERVE_STATIC` = `true` (default is true)
- (Optional Socket tuning)
  - `SOCKET_IO_PING_TIMEOUT` (default 60000)
  - `SOCKET_IO_PING_INTERVAL` (default 25000)
  - `SOCKET_IO_CONNECT_TIMEOUT` (default 20000)
  - `SOCKET_IO_MAX_BUFFER` (default 1048576)
  - `SOCKET_IO_UPGRADE_TIMEOUT` (default 10000)
  - `SOCKET_IO_PATH` (default `/socket.io`)
- (WhatsApp, if used)
  - `WA_AUTH_DIR` = `/httpdocs/backend/wa_auth` (make sure the folder exists and is writable)
  - `WA_RATE_WINDOW_MS`, `WA_RATE_MAX`, `WA_MEDIA_WINDOW_MS`, `WA_MEDIA_MAX`, `WA_MEDIA_TIMEOUT_MS`, `WA_DISABLE_FFMPEG`

3) Frontend Build on Server
```
cd /httpdocs/frontend
npm ci
npm run build
```
Backend will auto-serve from `../frontend/dist` when `SERVE_STATIC` is not `false`.

4) Optional: Additional Nginx Directives (Domains → Apache & nginx → Additional nginx directives)
```
location /socket.io/ {
  proxy_pass http://127.0.0.1:$PORT;
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection "upgrade";
  proxy_set_header Host $host;
  proxy_read_timeout 600s;
}

location /api/ {
  proxy_pass http://127.0.0.1:$PORT;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Forwarded-Proto $scheme;
}

location /uploads/ {
  proxy_pass http://127.0.0.1:$PORT;
}
```

5) Verify
- Open `https://yourdomain.com/api/health` → should return status `ok`.
- Check browser devtools → Socket.IO connects at `/socket.io` with JWT.
