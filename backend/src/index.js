import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import morgan from 'morgan';
import http from 'http';
import { connectDB } from './modules/config/db.js';
import mongoose from 'mongoose';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { initSocket, getIO } from './modules/config/socket.js';
import productsRoutes from './modules/routes/products.js';
import authRoutes from './modules/routes/auth.js';
import userRoutes from './modules/routes/users.js';
import ordersRoutes from './modules/routes/orders.js';
import warehouseRoutes from './modules/routes/warehouse.js';
import financeRoutes from './modules/routes/finance.js';
import supportRoutes from './modules/routes/support.js';
import settingsRoutes from './modules/routes/settings.js';

dotenv.config();

// Early boot diagnostics
console.log('[api] Booting API...')
console.log('[api] ENV', {
  PORT: process.env.PORT,
  USE_MEMORY_DB: process.env.USE_MEMORY_DB,
  ENABLE_WA: process.env.ENABLE_WA,
  MONGO_URI_SET: Boolean(process.env.MONGO_URI),
})

// Prevent process exit on unexpected async errors
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled Rejection:', reason)
})

const app = express();
const server = http.createServer(app);
initSocket(server);

const PORT = process.env.PORT || 4000;

// Flexible CORS: allow comma-separated origins from env, wildcard '*', and common local dev hosts
const envOrigins = (process.env.CORS_ORIGIN || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true) // allow non-browser clients
    const allowed = envOrigins
    const isWildcard = allowed.includes('*')
    const isListed = allowed.includes(origin)
    const isLocal127 = /^http:\/\/127\.0\.0\.1:\d+$/i.test(origin)
    const isLocalhost = /^http:\/\/localhost:\d+$/i.test(origin)
    if (isWildcard || isListed || isLocal127 || isLocalhost) return cb(null, true)
    return cb(new Error('Not allowed by CORS'))
  },
  credentials: true,
}
app.use(cors(corsOptions));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));

app.get('/api/health', (_req, res) => {
  const dbState = mongoose.connection?.readyState ?? 0 // 0=disconnected,1=connected,2=connecting,3=disconnecting
  const stateMap = { 0:'disconnected', 1:'connected', 2:'connecting', 3:'disconnecting' }
  const io = getIO()
  const socketHealth = io ? {
    connected: io.engine.clientsCount,
    transports: ['websocket', 'polling'],
    status: 'ok'
  } : { status: 'not_initialized' }
  res.json({
    name: 'BuySial Commerce API',
    status: 'ok',
    db: { state: dbState, label: stateMap[dbState] || String(dbState) },
    websocket: socketHealth,
    timestamp: new Date().toISOString()
  })
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/warehouse', warehouseRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/support', supportRoutes);
app.use('/api/settings', settingsRoutes);

// Serve uploaded product images
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=86400');
  next();
});
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

// Serve frontend static build if available (single-server deploy)
// Set SERVE_STATIC=false in env to disable.
let CLIENT_DIST = null;
let INDEX_HTML = null;
try {
  const serveStatic = process.env.SERVE_STATIC !== 'false';
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const candidates = [
    path.resolve(process.cwd(), '../frontend/dist'),
    path.resolve(process.cwd(), 'frontend/dist'),
    path.resolve(__dirname, '../../frontend/dist'),
    path.resolve('/app/frontend/dist'),
  ];
  for (const c of candidates){
    try{
      const idx = path.join(c, 'index.html');
      if (fs.existsSync(idx)) { CLIENT_DIST = c; INDEX_HTML = idx; break; }
    }catch{}
  }
  if (serveStatic && CLIENT_DIST && INDEX_HTML){
    app.use(express.static(CLIENT_DIST));
    console.log('Serving frontend from:', CLIENT_DIST);
  } else if (!serveStatic) {
    console.log('Static serving disabled via SERVE_STATIC=false');
  } else {
    console.warn('Frontend dist not found, SPA will not be served. Checked:', candidates);
  }
} catch (e) {
  console.warn('Static serve setup skipped:', e?.message || e);
}

// Serve PWA manifest and favicons directly from dist root if available
app.get(['/manifest.webmanifest','/favicon.svg','/favicon.ico'], (req, res, next) => {
  if (!INDEX_HTML || !CLIENT_DIST) return next();
  const f = path.join(CLIENT_DIST, req.path.replace('..',''));
  if (fs.existsSync(f)) return res.sendFile(f);
  return next();
});

// SPA fallback: let client router handle 404s (but do NOT intercept API, Socket.IO, or upload paths)
app.get('*', (req, res, next) => {
  try {
    const p = req.path || '';
    if (p.startsWith('/api/')) return next();
    if (p.startsWith('/socket.io')) return next();
    if (p.startsWith('/uploads')) return next();
    if (p.startsWith('/assets/')) return next();
    if (INDEX_HTML && fs.existsSync(INDEX_HTML)) {
      try{ res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate') }catch{}
      return res.sendFile(INDEX_HTML);
    }
    return next();
  } catch {
    return next();
  }
});

// Start HTTP server immediately; connect to DB in background so endpoints are reachable during DB spin-up
server.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`)
  // Register optional routes in background
  registerOptionalRoutes().catch(()=>{})
});

// If listen does not print in 5s, emit a hint
setTimeout(()=>{
  try{ console.log('[api] If you do not see "API running" above, startup may be blocked by an import error.') }catch{}
}, 5000)
connectDB()
  .then(() => {
    console.log('Database connected')
  })
  .catch((err) => {
    console.error('Database connection error:', err)
  })

async function registerOptionalRoutes(){
  try{
    const enableWA = process.env.ENABLE_WA !== 'false'
    if (enableWA){
      const { default: waRoutes } = await import('./modules/routes/wa.js')
      app.use('/api/wa', waRoutes)
      console.log('WhatsApp routes enabled')
    } else {
      console.log('WhatsApp routes disabled via ENABLE_WA=false')
    }
  }catch(err){
    console.error('Failed to init WhatsApp routes (continuing):', err?.message || err)
  }
}
