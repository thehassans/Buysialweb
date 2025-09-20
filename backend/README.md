# Buysial Backend

## WhatsApp Integration Hardening (Media)

We implemented safeguards to stabilize WhatsApp media delivery and reduce upstream 429s or server pressure:

- Size-capped in-memory LRU cache for downloaded media buffers.
- Per-key cooldowns (even on 404/not found) to prevent tight retry loops across clients.
- Global concurrency guard for `/api/wa/media` downloads to avoid overload.
- In-flight de-duplication so multiple callers for the same media share one download.

All changes live in `src/modules/routes/wa.js` and are runtime-tunable via environment variables.

## Environment Variables

- `WA_MEDIA_CACHE_MAX_BYTES` (default: `157286400` = 150 MB)
  - Upper bound on total bytes stored in the in-memory media cache.
- `WA_MEDIA_CACHE_ITEM_MAX_BYTES` (default: `8388608` = 8 MB)
  - Upper bound per cached media item; larger media is streamed but not cached to avoid OOM risk.
- `WA_MEDIA_MAX_CONCURRENCY` (default: `3`)
  - Maximum parallel media downloads server-wide. If exceeded, `/api/wa/media` responds `429 media-busy` with `Retry-After`.

Example `.env` (do not commit your real `.env`):

```
# WhatsApp Media controls
WA_MEDIA_CACHE_MAX_BYTES=120000000
WA_MEDIA_CACHE_ITEM_MAX_BYTES=8000000
WA_MEDIA_MAX_CONCURRENCY=2

# Existing variables you may already have
PORT=4000
MONGO_URI=mongodb://localhost:27017/buysial
JWT_SECRET=change-me
CORS_ORIGIN=http://localhost:5173
```

Tune these values based on server size and traffic:
- Small instance: `WA_MEDIA_MAX_CONCURRENCY=1-2`, cache 80–150 MB
- Larger instance: concurrency 3–4, cache 150–300 MB

## Start / Develop

`package.json` scripts:

- `npm run dev` — starts with nodemon (auto-reload). Good for local development.
- `npm start` — starts the server.

From `backend/` directory:

```
npm install
npm run dev   # or: npm start
```

## Validation Checklist

- Open a chat with images/documents/voice notes in the UI and verify bubbles load without bursts.
- Network calls to `/api/wa/media` may occasionally return `429 media-busy` or `504 media-timeout` with `Retry-After`; the frontend respects this and retries later.
- When a message truly has no media, server returns `404` with `Retry-After` to prevent tight loops.
- Monitor logs for `[wa media]` lines to see cooldown/escalation in action.

## Troubleshooting

- Getting frequent 429s from upstream or heavy CPU spikes:
  - Lower `WA_MEDIA_MAX_CONCURRENCY` (e.g., 1) and/or increase client cooldowns.
- Memory pressure or OOM:
  - Reduce `WA_MEDIA_CACHE_MAX_BYTES` and/or `WA_MEDIA_CACHE_ITEM_MAX_BYTES`.
- CORS errors in the browser:
  - Adjust `CORS_ORIGIN` in `.env`; multiple origins can be comma-separated. See `src/index.js` CORS section.

## Low-load server configuration

To minimize baseline CPU and request volume:

- Socket.IO (in `src/modules/config/socket.js`)
  - Defaults are tuned for low load: websocket-only, longer pings, small buffers.
  - Env toggles:
    - `SOCKET_WEBSOCKET_ONLY=true` (default): disable long-polling.
    - `SOCKET_PING_INTERVAL_MS=30000`, `SOCKET_PING_TIMEOUT_MS=70000`
    - `SOCKET_MAX_BUFFER_BYTES=500000`
    - `SOCKET_COMPRESS=false` (compression off by default to reduce CPU)
- HTTP logging (in `src/index.js`)
  - `HTTP_LOG=none` to fully disable request logs in production.
- WhatsApp cache TTLs (in `src/modules/routes/wa.js`)
  - `WA_CHATS_TTL_MS=6000` and `WA_MESSAGES_TTL_MS=8000` control server-side caching of list endpoints.
- Static assets
  - Build assets under `/assets` are served with long-lived caching headers by default.

## Data migration (ChatAssignment)

We standardized assignment documents to use `jid` instead of `chatId` and added indexes for faster queries.

Run once after deploy:

```
npm run migrate:chatassignment
```

This copies `chatId` -> `jid` where missing and removes the legacy field.

## Frontend client tuning

The WhatsApp Inbox UI reduces server load by:

- WebSocket-only transport and slower reconnection backoff.
- Larger minimum interval for messages refresh.
- Media fetch queue with global and per-key cooldowns that respect `Retry-After`.
