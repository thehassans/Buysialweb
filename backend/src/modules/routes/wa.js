import { Router } from 'express';
import { auth, allowRoles } from '../middleware/auth.js';
import multer from 'multer';
import os from 'os';
import path from 'path';
import fs from 'fs';
import ChatMeta from '../models/ChatMeta.js';
import Setting from '../models/Setting.js';
import User from '../models/User.js';
import rateLimit from '../middleware/rateLimit.js';
import WaSession from '../models/WaSession.js';

const router = Router();
// Ensure upload temp directory exists to avoid ENOENT on some hosts
const TEMP_DIR = path.join(os.tmpdir(), 'buysial-wa');
try { fs.mkdirSync(TEMP_DIR, { recursive: true }); } catch {}
const upload = multer({ dest: TEMP_DIR });

// Stricter rate limit for media fetches (heavier upstream load)
const MEDIA_WINDOW = Math.max(2000, Number(process.env.WA_MEDIA_WINDOW_MS || 10000));
const MEDIA_MAX = Math.max(2, Number(process.env.WA_MEDIA_MAX || 5));

// Lightweight media metadata (no download). Helps diagnose 504 vs 404 vs no-media.
router.get('/media/meta', auth, rateLimit({ windowMs: MEDIA_WINDOW, max: MEDIA_MAX }), async (req, res) => {
  try{
    const waService = await getWaService();
    const { jid, id } = req.query || {};
    if (!jid || !id) return res.status(400).json({ error: 'jid and id required' });
    if (req.user?.role === 'agent') {
      const meta = await ChatMeta.findOne({ jid, assignedTo: req.user.id });
      if (!meta) return res.status(403).json({ error: 'Not allowed for this chat' });
    }
    const info = await waService.getMediaMeta(jid, id)
    // info.hasMedia false -> 404; true -> 200 with type/mime/size
    if (!info || info.hasMedia === false){
      try{ res.setHeader('Cache-Control', 'public, max-age=30') }catch{}
      return res.status(404).json({ hasMedia: false })
    }
    return res.json({ ...info })
  }catch(err){
    const msg = String(err?.message || 'failed')
    try{ console.error('[wa media/meta] error', msg) }catch{}
    return res.status(500).json({ error: 'failed' })
  }
})

// Global, conservative rate limit for WA API to avoid hammering
const GLOBAL_WINDOW = Math.max(500, Number(process.env.WA_RATE_WINDOW_MS || 2000));
const GLOBAL_MAX = Math.max(5, Number(process.env.WA_RATE_MAX || 20));
const globalLimiter = rateLimit({ windowMs: GLOBAL_WINDOW, max: GLOBAL_MAX });
// Skip low-cost endpoints that may be called frequently
router.use((req, res, next) => {
  try{
    const p = req.path || ''
    if (p === '/mark-read' || p === '/status') return next();
  }catch{}
  return globalLimiter(req, res, next)
});

// Soft-delete (hide) a chat for User/Admin (does not affect agents)
router.post('/chat-delete', auth, allowRoles('admin', 'user'), async (req, res) => {
  try{
    const { jid } = req.body || {}
    if (!jid) return res.status(400).json({ error: 'jid required' })
    let meta = await ChatMeta.findOne({ jid })
    if (!meta) meta = new ChatMeta({ jid })
    meta.hiddenForUser = true
    meta.deletedAt = new Date()
    try{ meta.deletedBy = req.user?.id || null }catch{}
    await meta.save()
    return res.json({ ok: true })
  }catch(err){
    return res.status(500).json({ error: err?.message || 'failed' })
  }
})

// Multer wrappers that always return JSON errors instead of HTML error pages
function multerArray(field, max){
  return (req, res, next) => {
    upload.array(field, max)(req, res, (err) => {
      if (err) {
        const code = 400;
        try{ console.error('[upload.array] error', { field, message: err?.message || err }) }catch{}
        return res.status(code).json({ error: String(err?.message || err) });
      }
      next();
    });
  }
}
function multerSingle(field){
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (err) {
        const code = 400;
        try{ console.error('[upload.single] error', { field, message: err?.message || err }) }catch{}
        return res.status(code).json({ error: String(err?.message || err) });
      }
      next();
    });
  }
}

// Helper to lazy-load the service, ensuring it's initialized after socket.io
const getWaService = async () => (await import('../services/whatsapp.js')).default;

router.get('/status', auth, async (_req, res) => {
  const waService = await getWaService();
  const st = await waService.getStatus();
  res.json(st);
});

router.post('/connect', auth, async (_req, res) => {
  const waService = await getWaService();
  const data = await waService.startConnection();
  res.json({ message: 'QR generated', ...data });
});

router.get('/qr', auth, async (_req, res) => {
  const waService = await getWaService();
  const data = await waService.getQR();
  res.json(data);
});

router.post('/logout', auth, async (_req, res) => {
  const waService = await getWaService();
  await waService.logout();
  res.json({ message: 'WhatsApp session cleared' });
});

// List session history (recently connected WhatsApp numbers)
router.get('/sessions', auth, allowRoles('admin','user','manager'), async (req, res) => {
  try{
    const limit = Math.max(1, Math.min(100, Number(req.query?.limit || 20)))
    const docs = await WaSession.find({}).sort({ connectedAt: -1, createdAt: -1 }).limit(limit).lean()
    const sessions = (docs||[]).map(d => ({
      id: String(d._id),
      number: d.number || null,
      phone: d.phone || null,
      connectedAt: d.connectedAt || d.createdAt || null,
      disconnectedAt: d.disconnectedAt || null,
      active: !!d.active,
    }))
    res.json({ sessions })
  }catch(err){ res.status(500).json({ error: err?.message || 'failed' }) }
})

// Mark a chat as read (reset unread counters)
router.post('/mark-read', auth, async (req, res) => {
  try{
    const { jid } = req.body || {};
    if (!jid) return res.status(400).json({ error: 'jid required' });
    // Agents may mark read only for chats assigned to them
    if (req.user?.role === 'agent'){
      const meta = await ChatMeta.findOne({ jid, assignedTo: req.user.id });
      if (!meta) return res.status(403).json({ error: 'Not allowed for this chat' });
    }
    const waService = await getWaService();
    const r = await waService.markRead(jid);
    res.json(r || { ok: true });
  }catch(err){ res.status(500).json({ error: err?.message || 'failed' }); }
});

// Auto-assign setting endpoints
router.get('/auto-assign', auth, async (_req, res) => {
  try {
    const s = await Setting.findOne({ key: 'wa_auto_assign' });
    const enabled = s && typeof s.value === 'boolean' ? s.value : true;
    res.json({ enabled });
  } catch (err) { res.status(500).json({ error: err?.message || 'failed' }); }
});

router.post('/auto-assign', auth, allowRoles('admin', 'user'), async (req, res) => {
  try {
    const { enabled } = req.body || {};
    if (typeof enabled !== 'boolean') return res.status(400).json({ error: 'enabled boolean required' });
    await Setting.findOneAndUpdate(
      { key: 'wa_auto_assign' },
      { $set: { value: enabled } },
      { upsert: true }
    );
    res.json({ ok: true, enabled });
  } catch (err) { res.status(500).json({ error: err?.message || 'failed' }); }
});

// Server-Sent Events for QR/status/messages
router.get('/events', auth, async (req, res) => {
  const waService = await getWaService();
  waService.sse(req, res);
});

// List chats (enriched with ownership info)
router.get('/chats', auth, async (req, res) => {
  // In-memory TTL cache + in-flight de-duplication
  // Keyed by user id so agents only see their own filtered list
  const uid = String(req.user?.id || 'anon')
  const cacheKey = `chats:${uid}`
  const now = Date.now()
  const ttlMs = 2000
  try{
    const cached = (global.__waChatCache = global.__waChatCache || new Map()).get(cacheKey)
    if (cached && (now - cached.at < ttlMs)){
      return res.json(cached.data)
    }
    const inflightMap = (global.__waChatInflight = global.__waChatInflight || new Map())
    if (inflightMap.has(cacheKey)){
      try{ const data = await inflightMap.get(cacheKey); return res.json(data) }catch(e){ /* fallthrough */ }
    }
    const p = (async ()=>{
      const waService = await getWaService();
      let chats = await waService.listChats();
      let filterToJids = null;
      if (req.user?.role === 'agent') {
        const metas = await ChatMeta.find({ assignedTo: req.user.id }, 'jid').lean();
        const allowed = new Set(metas.map(m => m.jid));
        chats = chats.filter(c => allowed.has(c.id));
        filterToJids = new Set(chats.map(c => c.id));
      }
      // Load meta for these chats
      const jids = chats.map(c => c.id);
      const metas = await ChatMeta.find(filterToJids ? { jid: { $in: Array.from(filterToJids) } } : { jid: { $in: jids } }).lean();
      const metaByJid = new Map(metas.map(m => [m.jid, m]));
      // Fetch owners
      const ownerIds = Array.from(new Set(metas.filter(m => m.assignedTo).map(m => String(m.assignedTo))));
      let ownersById = new Map();
      if (ownerIds.length) {
        const owners = await User.find({ _id: { $in: ownerIds } }, 'firstName lastName email').lean();
        ownersById = new Map(owners.map(u => [String(u._id), u]));
      }
      // Hide chats that user has deleted (soft-hidden in ChatMeta)
      const filteredList = (req.user?.role === 'user')
        ? chats.filter(c => { const m = metaByJid.get(c.id); return !(m && m.hiddenForUser) })
        : chats;
      const enriched = filteredList.map(c => {
        const m = metaByJid.get(c.id);
        let owner = null;
        if (m && m.assignedTo) {
          const u = ownersById.get(String(m.assignedTo));
          if (u) { owner = { id: String(m.assignedTo), name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Agent' }; }
          else { owner = { id: String(m.assignedTo), name: 'Agent' }; }
        }
        return { ...c, owner };
      });
      return enriched
    })()
    inflightMap.set(cacheKey, p)
    try{
      const data = await p
      ;(global.__waChatCache).set(cacheKey, { data, at: now })
      return res.json(data)
    }finally{
      inflightMap.delete(cacheKey)
    }
  }catch(err){
    // Fallback to original logic if cache path errors
  }
  const waService = await getWaService();
  let chats = await waService.listChats();
  let filterToJids = null;
  if (req.user?.role === 'agent') {
    const metas = await ChatMeta.find({ assignedTo: req.user.id }, 'jid').lean();
    const allowed = new Set(metas.map(m => m.jid));
    chats = chats.filter(c => allowed.has(c.id));
    filterToJids = new Set(chats.map(c => c.id));
  }
  // Load meta for these chats
  const jids = chats.map(c => c.id);
  const metas = await ChatMeta.find(filterToJids ? { jid: { $in: Array.from(filterToJids) } } : { jid: { $in: jids } }).lean();
  const metaByJid = new Map(metas.map(m => [m.jid, m]));
  // Fetch owners
  const ownerIds = Array.from(new Set(metas.filter(m => m.assignedTo).map(m => String(m.assignedTo))));
  let ownersById = new Map();
  if (ownerIds.length) {
    const owners = await User.find({ _id: { $in: ownerIds } }, 'firstName lastName email').lean();
    ownersById = new Map(owners.map(u => [String(u._id), u]));
  }
  const list = (req.user?.role === 'user')
    ? chats.filter(c => { const m = metaByJid.get(c.id); return !(m && m.hiddenForUser) })
    : chats;
  const enriched = list.map(c => {
    const m = metaByJid.get(c.id);
    let owner = null;
    if (m && m.assignedTo) {
      const u = ownersById.get(String(m.assignedTo));
      if (u) { owner = { id: String(m.assignedTo), name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Agent' }; }
      else { owner = { id: String(m.assignedTo), name: 'Agent' }; }
    }
    return { ...c, owner };
  });
  res.json(enriched);
});

// Get messages for a chat
router.get('/messages', auth, async (req, res) => {
  const { jid, limit, beforeId } = req.query;
  if (!jid) return res.status(400).json({ error: 'jid required' });
  if (req.user?.role === 'agent') {
    const meta = await ChatMeta.findOne({ jid, assignedTo: req.user.id });
    if (!meta) return res.status(403).json({ error: 'Not allowed for this chat' });
  }
  // In-memory TTL cache + in-flight de-duplication by user + chat + cursor
  const uid = String(req.user?.id || 'anon')
  const key = `msgs:${uid}:${jid}:${beforeId||''}:${limit||''}`
  const now = Date.now()
  const ttlMs = 4000
  try{
    const cache = (global.__waMsgCache = global.__waMsgCache || new Map())
    const cached = cache.get(key)
    if (cached && (now - cached.at < ttlMs)){
      return res.json(cached.data)
    }
    const inMap = (global.__waMsgInflight = global.__waMsgInflight || new Map())
    if (inMap.has(key)){
      try{ const data = await inMap.get(key); return res.json(data) }catch(e){ /* fallthrough */ }
    }
    const p = (async ()=>{
      const waService = await getWaService();
      const msgs = await waService.getMessages(jid, limit ? Number(limit) : 25, beforeId || null);
      return msgs
    })()
    inMap.set(key, p)
    try{
      const data = await p
      cache.set(key, { data, at: now })
      return res.json(data)
    }finally{
      inMap.delete(key)
    }
  }catch(err){
    // fall back to direct service on any cache error
  }
  const waService = await getWaService();
  const msgs = await waService.getMessages(jid, limit ? Number(limit) : 25, beforeId || null);
  res.json(msgs);
});

// Send text message
router.post('/send-text', auth, async (req, res) => {
  try{
    const waService = await getWaService();
    const { jid, text } = req.body || {};
    if (!jid || !text) return res.status(400).json({ error: 'jid and text required' });
    if (req.user?.role === 'agent') {
      const meta = await ChatMeta.findOne({ jid, assignedTo: req.user.id });
      if (!meta) return res.status(403).json({ error: 'Not allowed for this chat' });
    }
    try{
      // Per-jid serialization to avoid parallel sends that can trigger upstream 429/500
      const chains = (global.__waSendChains = global.__waSendChains || new Map());
      const key = String(jid)
      const last = chains.get(key) || Promise.resolve()
      const p = last.then(() => waService.sendText(jid, text))
      chains.set(key, p.finally(() => { if (chains.get(key) === p) chains.delete(key) }))
      const r = await p;
      res.json(r);
    }catch(err){
      const msg = String(err?.message || 'failed');
      // Classify errors: transient (503) vs client (400) vs server (500)
      const isTransient = (msg.startsWith('send-transient:') || msg.includes('wa-not-connected'))
      const isClientErr = (
        msg.includes('invalid-jid') ||
        msg.includes('wa-number-not-registered') ||
        msg.startsWith('send-failed:')
      );
      const code = isTransient ? 503 : (isClientErr ? 400 : 500);
      try{ console.error('[send-text] error', { jid, msg, code }) }catch{}
      const body = { error: msg };
      if (isTransient) body.transient = true;
      try{ if (isTransient) res.setHeader('Retry-After', '2') }catch{}
      res.status(code).json(body);
    }
  }catch(outerErr){
    const msg = String(outerErr?.message || 'failed');
    try{ console.error('[send-text] outer error', { msg }) }catch{}
    try{ res.setHeader('Retry-After', '2') }catch{}
    return res.status(500).json({ error: `send-transient:${msg}` });
  }
});

// Send media (up to 30 files)
router.post('/send-media', auth, multerArray('files', 30), async (req, res) => {
  const waService = await getWaService();
  const { jid } = req.body || {};
  if (!jid) return res.status(400).json({ error: 'jid required' });
  if (req.user?.role === 'agent') {
    const meta = await ChatMeta.findOne({ jid, assignedTo: req.user.id });
    if (!meta) return res.status(403).json({ error: 'Not allowed for this chat' });
  }
  try{
    // Per-jid serialization to minimize concurrent media sends to same target
    const chains = (global.__waSendChains = global.__waSendChains || new Map());
    const key = String(jid)
    const last = chains.get(key) || Promise.resolve()
    const p = last.then(() => waService.sendMedia(jid, req.files || []))
    chains.set(key, p.finally(() => { if (chains.get(key) === p) chains.delete(key) }))
    const r = await p
    res.json(r);
  }catch(err){
    const msg = String(err?.message || 'failed');
    const code = (
      msg.includes('wa-not-connected') ||
      msg.includes('invalid-jid') ||
      msg.includes('wa-number-not-registered') ||
      msg.startsWith('send-failed:')
    ) ? 400 : 500;
    try{ console.error('[send-media] error', { jid, msg, code }) }catch{}
    res.status(code).json({ error: msg });
  }
});

// Send voice (ptt)
router.post('/send-voice', auth, multerSingle('voice'), async (req, res) => {
  const waService = await getWaService();
  const { jid, voiceToken } = req.body || {};
  if (!jid) return res.status(400).json({ error: 'jid required' });
  if (!req.file) return res.status(400).json({ error: 'voice file required' });
  if (req.user?.role === 'agent') {
    const meta = await ChatMeta.findOne({ jid, assignedTo: req.user.id });
    if (!meta) return res.status(403).json({ error: 'Not allowed for this chat' });
  }
  // attach token so service can make it cancelable
  if (voiceToken) req.file.voiceToken = String(voiceToken);
  try {
    // Per-jid serialization to minimize concurrent voice sends to same target
    const chains = (global.__waSendChains = global.__waSendChains || new Map());
    const key = String(jid)
    const last = chains.get(key) || Promise.resolve()
    const p = last.then(() => waService.sendVoice(jid, req.file))
    chains.set(key, p.finally(() => { if (chains.get(key) === p) chains.delete(key) }))
    const r = await p
    res.json(r);
  } catch (err) {
    const msg = String(err?.message || 'failed');
    if (msg.includes('voice-canceled')) {
      return res.status(200).json({ ok: false, canceled: true });
    }
    // Classify errors similarly to send-text: transient -> 503 with Retry-After, client issues -> 400, else 500
    const isTransient = (msg.includes('wa-not-connected') || msg.startsWith('send-transient:'))
    const isClientErr = (
      msg.includes('invalid-jid') ||
      msg.includes('wa-number-not-registered') ||
      msg.startsWith('send-failed:')
    )
    const code = isTransient ? 503 : (isClientErr ? 400 : 500)
    try{ console.error('[send-voice] error', { jid, msg, code }) }catch{}
    if (isTransient){ try{ res.setHeader('Retry-After', '2') }catch{} }
    res.status(code).json({ ok: false, error: msg, transient: !!isTransient });
  }
});

// Cancel in-flight voice by token
router.post('/cancel-voice', auth, async (req, res) => {
  const waService = await getWaService();
  const { voiceToken } = req.body || {};
  if (!voiceToken) return res.status(400).json({ error: 'voiceToken required' });
  const r = waService.cancelVoice(String(voiceToken));
  res.json(r);
});

// Download media for a specific message
router.get('/media', auth, rateLimit({ windowMs: MEDIA_WINDOW, max: MEDIA_MAX }), async (req, res) => {
  const waService = await getWaService();
  const { jid, id } = req.query || {};
  if (!jid || !id) return res.status(400).json({ error: 'jid and id required' });
  if (req.user?.role === 'agent') {
    const meta = await ChatMeta.findOne({ jid, assignedTo: req.user.id });
    if (!meta) return res.status(403).json({ error: 'Not allowed for this chat' });
  }
  const key = `${jid}:${id}`
  const now = Date.now()
  // If this key recently failed, short-circuit with a Retry-After to prevent hammering upstream
  try{
    const failMap = (global.__waMediaFail = global.__waMediaFail || new Map())
    const rec = failMap.get(key)
    if (rec && typeof rec.until === 'number' && now < rec.until){
      const waitSec = Math.ceil((rec.until - now)/1000)
      try{ res.setHeader('Retry-After', String(Math.max(5, waitSec))) }catch{}
      return res.status(504).json({ error: 'media-timeout' })
    }
  }catch{}
  const cache = (global.__waMediaCache = global.__waMediaCache || new Map())
  const cached = cache.get(key)
  // 1 day TTL cache in-memory
  if (cached && (now - cached.at < 86400*1000)){
    const m = cached.data
    if (m.fileName) res.setHeader('Content-Disposition', `inline; filename="${m.fileName}"`)
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
    res.setHeader('Content-Type', m.mimeType || 'application/octet-stream')
    try{ res.setHeader('Content-Length', String(m.buffer?.length || 0)) }catch{}
    return res.end(m.buffer)
  }
  const inflight = (global.__waMediaInflight = global.__waMediaInflight || new Map())
  if (inflight.has(key)){
    try{
      const m = await inflight.get(key)
      if (!m) return res.status(404).json({ error: 'media not found' })
      if (m.fileName) res.setHeader('Content-Disposition', `inline; filename="${m.fileName}"`)
      res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
      res.setHeader('Content-Type', m.mimeType || 'application/octet-stream')
      try{ res.setHeader('Content-Length', String(m.buffer?.length || 0)) }catch{}
      return res.end(m.buffer)
    }catch(err){
      const msg = String(err?.message || 'failed')
      try{ console.error('[wa media] inflight error', { jid, id, msg }) }catch{}
      // Escalate per-key cooldown progressively
      try{
        const failMap = (global.__waMediaFail = global.__waMediaFail || new Map())
        const rec = failMap.get(key) || { count: 0, until: 0 }
        rec.count = (rec.count||0) + 1
        const waitSec = Math.min(60, 10 + rec.count*10)
        rec.until = Date.now() + waitSec*1000
        failMap.set(key, rec)
        res.setHeader('Retry-After', String(waitSec))
      }catch{}
      // Try to return a tiny placeholder for images to avoid broken thumbnails
      try{
        const info = await waService.getMediaMeta(jid, id).catch(()=>null)
        if (info && info.hasMedia && info.type === 'image'){
          const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4////fwAJ/gPNgYv9YAAAAABJRU5ErkJggg==', 'base64')
          res.setHeader('Content-Type', 'image/png')
          res.setHeader('Cache-Control', 'no-store, must-revalidate')
          res.setHeader('X-Reason', 'media-timeout')
          return res.end(tinyPng)
        }
      }catch{}
      // For non-image types, send 204 No Content with Retry-After to avoid error status in client
      try{ res.setHeader('X-Reason', 'media-timeout') }catch{}
      return res.status(204).end()
    }
  }
  const p = (async ()=>{
    const m = await waService.getMedia(jid, id)
    return m
  })()
  inflight.set(key, p)
  try{
    const m = await p
    if (!m) {
      // Negative cache for not-found to avoid repeated upstream work
      try{
        const failMap = (global.__waMediaFail = global.__waMediaFail || new Map())
        const rec = failMap.get(key) || { count: 0, until: 0 }
        rec.count = (rec.count||0) + 1
        const waitSec = Math.min(60, 5 + rec.count*5)
        rec.until = Date.now() + waitSec*1000
        failMap.set(key, rec)
        res.setHeader('Retry-After', String(waitSec))
      }catch{}
      try{ res.setHeader('Cache-Control', 'public, max-age=30') }catch{}
      return res.status(404).json({ error: 'media not found' })
    }
    // Clear any failure cooldown for this key after success
    try{ const failMap = (global.__waMediaFail = global.__waMediaFail || new Map()); if (failMap.has(key)) failMap.delete(key) }catch{}
    cache.set(key, { data: m, at: Date.now() })
    if (m.fileName) res.setHeader('Content-Disposition', `inline; filename="${m.fileName}"`)
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
    res.setHeader('Content-Type', m.mimeType || 'application/octet-stream')
    try{ res.setHeader('Content-Length', String(m.buffer?.length || 0)) }catch{}
    return res.end(m.buffer)
  }catch(err){
    const msg = String(err?.message || 'failed')
    try{ console.error('[wa media] error', { jid, id, msg }) }catch{}
    // Escalate per-key cooldown progressively
    try{
      const failMap = (global.__waMediaFail = global.__waMediaFail || new Map())
      const rec = failMap.get(key) || { count: 0, until: 0 }
      rec.count = (rec.count||0) + 1
      const waitSec = Math.min(60, 10 + rec.count*10)
      rec.until = Date.now() + waitSec*1000
      failMap.set(key, rec)
      res.setHeader('Retry-After', String(waitSec))
    }catch{}
    // Try to return a tiny placeholder for images to avoid broken thumbnails
    try{
      const info = await waService.getMediaMeta(jid, id).catch(()=>null)
      if (info && info.hasMedia && info.type === 'image'){
        const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4AWP4////fwAJ/gPNgYv9YAAAAABJRU5ErkJggg==', 'base64')
        res.setHeader('Content-Type', 'image/png')
        res.setHeader('Cache-Control', 'no-store, must-revalidate')
        res.setHeader('X-Reason', 'media-timeout')
        return res.end(tinyPng)
      }
    }catch{}
    // For non-image types, send 204 No Content with Retry-After to avoid error status in client
    try{ res.setHeader('X-Reason', 'media-timeout') }catch{}
    return res.status(204).end()
  }finally{
    inflight.delete(key)
  }
});

// Get chat meta (notes, assignment)
router.get('/chat-meta', auth, async (req, res) => {
  const { jid } = req.query || {};
  if (!jid) return res.status(400).json({ error: 'jid required' });
  if (req.user?.role === 'agent') {
    const meta = await ChatMeta.findOne({ jid, assignedTo: req.user.id });
    if (!meta) return res.status(403).json({ error: 'Not allowed for this chat' });
    return res.json(meta);
  }
  const meta = await ChatMeta.findOne({ jid });
  res.json(meta || { jid, notes: [], assignedTo: null });
});

// Add a chat note
router.post('/chat-meta/notes', auth, async (req, res) => {
  const { jid, text } = req.body || {};
  if (!jid || !text) return res.status(400).json({ error: 'jid and text required' });
  let meta = await ChatMeta.findOne({ jid });
  if (!meta) meta = new ChatMeta({ jid });
  // Agent can only add if assigned to this chat
  if (req.user?.role === 'agent') {
    if (!meta.assignedTo || String(meta.assignedTo) !== String(req.user.id)) {
      return res.status(403).json({ error: 'Not allowed for this chat' });
    }
  }
  meta.notes.push({ text, createdBy: req.user.id });
  await meta.save();
  res.json({ ok: true, meta });
});

// Assign chat to agent (admin or user only)
router.post('/chat-meta/assign', auth, allowRoles('admin', 'user'), async (req, res) => {
  const { jid, agentId } = req.body || {};
  if (!jid || !agentId) return res.status(400).json({ error: 'jid and agentId required' });
  let meta = await ChatMeta.findOne({ jid });
  if (!meta) meta = new ChatMeta({ jid });
  meta.assignedTo = agentId;
  meta.assignedBy = req.user.id;
  await meta.save();
  res.json({ ok: true, meta });
});

export default router;
