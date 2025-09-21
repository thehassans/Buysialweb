import makeWASocket, { useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion, downloadContentFromMessage } from '@whiskeysockets/baileys/lib/index.js';
import Pino from 'pino';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFile } from 'child_process';
import QRCode from 'qrcode';
import mime from 'mime-types';
import { getIO } from '../config/socket.js';
import ChatAssignment from '../models/ChatAssignment.js';
import ChatMeta from '../models/ChatMeta.js';
import RoundRobin from '../models/RoundRobin.js';
import User from '../models/User.js';
import Setting from '../models/Setting.js';
import WaMessage from '../models/WaMessage.js';

// Singleton state
let sock = null;
let saveCreds = null;
let qrString = null;
let connectedNumber = null;

// Single-flight guard and reconnect backoff to avoid tight reconnect loops
let connectPromise = null;
let reconnectBackoffMs = 1000; // start with 1s, exponential up to 30s
let reconnectTimer = null;
let cachedVersion = null; // cache Baileys version for the process lifetime

function scheduleReconnect(){
  try{
    if (reconnectTimer) return;
    const delay = Math.min(Math.max(500, reconnectBackoffMs), 30000);
    console.warn(`[wa] Scheduling reconnect in ${delay}ms`);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      ensureSock().catch(e => {
        try{ console.error('[wa] Reconnect attempt failed:', e?.message || e) }catch{}
      });
    }, delay);
    // Exponential backoff for subsequent attempts
    reconnectBackoffMs = Math.min(delay * 2, 30000);
  }catch{}
}

// In-flight voice jobs keyed by a client-provided token
// token -> { canceled: boolean, proc: ChildProcess|null }
const voiceJobs = new Map();

// Lightweight in-memory store
const chats = new Map(); // jid -> { id, name, unreadCount }
const messages = new Map(); // jid -> [ { key, message, pushName, messageTimestamp } ]
// Capture status updates that may arrive before the corresponding upsert
const pendingStatus = new Map(); // id -> { jid, status }

const AUTH_DIR = path.resolve(process.env.WA_AUTH_DIR || path.join(process.cwd(), '.wa-auth'));
if (!fs.existsSync(AUTH_DIR)) fs.mkdirSync(AUTH_DIR, { recursive: true });

// Default timeout for WhatsApp media downloads (to prevent long-hanging streams)
const DEFAULT_MEDIA_TIMEOUT_MS = Number(process.env.WA_MEDIA_TIMEOUT_MS || 20000);

async function readStreamWithTimeout(asyncIterable, timeoutMs) {
  const chunks = [];
  const start = Date.now();
  try {
    for await (const c of asyncIterable) {
      chunks.push(c);
      if (Date.now() - start > Math.max(1000, Number(timeoutMs) || DEFAULT_MEDIA_TIMEOUT_MS)) {
        // Attempt to cancel/close the iterator to free resources
        try { if (typeof asyncIterable.return === 'function') await asyncIterable.return(); } catch {}
        throw new Error('media-timeout');
      }
    }
  } catch (e) {
    if (String(e?.message || '') === 'media-timeout') throw e;
    throw e;
  }
  return Buffer.concat(chunks);
}

// Small utility: coerce possible thumbnail representations into a Buffer
function toBufferMaybe(x){
  try{
    if (!x) return null
    if (Buffer.isBuffer(x)) return x
    if (Array.isArray(x)) return Buffer.from(x)
    if (typeof x === 'string'){
      // Prefer base64 decoding; if it isn't base64, fall back to utf8 bytes
      try{ return Buffer.from(x, 'base64') }catch{}
      try{ return Buffer.from(x) }catch{}
    }
  }catch{}
  return null
}

// Global semaphore to limit concurrent media downloads across all requests
async function withMediaSlot(fn){
  const bag = (global.__waMediaSlots = global.__waMediaSlots || { active: 0, q: [] })
  const limit = Math.max(1, Number(process.env.WA_MEDIA_CONCURRENCY || 1))
  if (bag.active >= limit){
    await new Promise(res => bag.q.push(res))
  }
  bag.active++
  try{
    return await fn()
  }finally{
    bag.active--
    const next = bag.q.shift()
    if (next) try{ next() }catch{}
  }
}

async function ensureSock() {
  if (sock) return sock;
  if (connectPromise) return connectPromise;
  connectPromise = (async () => {
    console.log('[wa] Initializing new socket connection...');

    const { state, saveCreds: _saveCreds } = await useMultiFileAuthState(AUTH_DIR);
    saveCreds = _saveCreds;

    const verRes = cachedVersion ? { version: cachedVersion } : await fetchLatestBaileysVersion();
    const { version } = verRes;
    cachedVersion = version;

    sock = makeWASocket({
      version,
      printQRInTerminal: false,
      auth: state,
      browser: ['BuySial', 'Chrome', '1.0.0'],
      logger: Pino({ level: 'silent' })
    });

    // Lightweight in-memory chat/message store
    // Maintain chats and messages maps
    chats.clear();
    messages.clear();

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    console.log(`[wa] Connection update: ${connection}`);
    if (lastDisconnect) console.log('[wa] Last disconnect:', lastDisconnect);

    const io = getIO();
    if (!io) return console.error('[wa] socket.io instance not available in connection.update');

    if (qr) {
      qrString = qr;
      try {
        const dataUrl = await QRCode.toDataURL(qr);
        io.emit('qr', { qr: dataUrl });
      } catch (e) { console.error('[wa] QR code generation failed:', e); }
    }
    if (connection === 'open') {
      connectedNumber = sock?.user?.id || null;
      io.emit('status', { connected: true, number: connectedNumber });
      // Record session history (active)
      try{
        const WaSessionMod = await import('../models/WaSession.js')
        const WaSession = WaSessionMod.default || WaSessionMod
        const phone = String(connectedNumber||'').replace(/[^0-9]/g,'')
        // Create a new session entry for history
        await WaSession.create({ number: connectedNumber, phone, connectedAt: new Date(), active: true, disconnectedAt: null })
      }catch(e){ try{ console.warn('[wa] session log (open) failed', e?.message||e) }catch{} }
      // Reset reconnect backoff on successful open and cancel any pending timer
      try{ reconnectBackoffMs = 1000; if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; } }catch{}
    } else if (connection === 'close') {
      const shouldReconnect = (lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut);
      io.emit('status', { connected: false });
      sock = null;
      // If logged out (explicit), mark last active session as closed
      try{
        if (!shouldReconnect && connectedNumber){
          const WaSessionMod = await import('../models/WaSession.js')
          const WaSession = WaSessionMod.default || WaSessionMod
          const phone = String(connectedNumber||'').replace(/[^0-9]/g,'')
          await WaSession.updateMany({ phone, active: true }, { $set: { active: false, disconnectedAt: new Date() } })
        }
      }catch(e){ try{ console.warn('[wa] session log (close) failed', e?.message||e) }catch{} }
      if (shouldReconnect) {
        console.log('[wa] Connection closed; will attempt reconnect with backoff');
        scheduleReconnect();
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages: newMsgs }) => {
    const io = getIO();
    if (!io) return console.error('[wa] socket.io instance not available in messages.upsert');

    for (const m of newMsgs || []) {
      const jid = m?.key?.remoteJid;
      if (!jid) continue;
      // track chat
      const existing = chats.get(jid) || { id: jid, name: m.pushName || jid, unreadCount: 0 };
      // derive a short preview
      let preview = '';
      const msg = m?.message || {};
      if (msg.conversation) preview = msg.conversation;
      else if (msg.extendedTextMessage?.text) preview = msg.extendedTextMessage.text;
      else if (msg.imageMessage) preview = '[image]';
      else if (msg.videoMessage) preview = '[video]';
      else if (msg.audioMessage) preview = '[voice]';
      else if (msg.documentMessage) preview = '[file]';
      else if (msg.locationMessage) preview = '[location]';
      existing.preview = preview || existing.preview || '';
      existing.lastTs = m?.messageTimestamp ? Number(m.messageTimestamp) * 1000 : Date.now();
      // increment unread counter for inbound messages
      if (!m?.key?.fromMe) {
        existing.unreadCount = (existing.unreadCount || 0) + 1;
        existing.unread = true;
      }
      chats.set(jid, existing);
      // track messages per chat
      const arr = messages.get(jid) || [];
      const fromMe = !!m?.key?.fromMe;
      const status = fromMe ? 'sent' : undefined;
      const newMsg = { key: m.key, message: m.message, pushName: m.pushName, messageTimestamp: m.messageTimestamp, fromMe, status };
      arr.push(newMsg);
      if (arr.length > 200) arr.shift();
      messages.set(jid, arr);

      // Apply any pending status captured earlier
      const pending = pendingStatus.get(String(m?.key?.id || ''))
      if (pending && pending.jid === jid) {
        newMsg.status = pending.status
        try{ pendingStatus.delete(String(m?.key?.id || '')) }catch{}
      }

      // Persist to DB (best-effort) without downgrading status
      try{
        const setDoc = {
          jid,
          key: { id: String(m?.key?.id || ''), fromMe },
          fromMe,
          message: m.message,
          pushName: m.pushName,
          messageTimestamp: Number(m.messageTimestamp || 0),
        }
        const update = { $set: setDoc, $setOnInsert: {} }
        if (status) { update.$setOnInsert.status = status }
        await WaMessage.updateOne(
          { jid, 'key.id': String(m?.key?.id || '') },
          update,
          { upsert: true }
        )
      }catch(err){ try{ console.error('[wa] save msg error', err?.message||err) }catch{} }

      // Emit new message event
      io.emit('message.new', { jid, message: newMsg });

      // Auto-assign new inbound chats (round-robin) and record firstMessageAt
      if (!fromMe) {
        ; (async () => {
          try {
            // Check auto-assign setting (default true)
            let enabled = true;
            try {
              const s = await Setting.findOne({ key: 'wa_auto_assign' });
              if (s && typeof s.value === 'boolean') enabled = s.value;
            } catch { }

            let ca = await ChatAssignment.findOne({ jid });
            if (!ca) {
              // Only assign if enabled
              if (enabled) {
                const agents = await User.find({ role: 'agent' }).sort({ createdAt: 1 });
                if (agents.length) {
                  const rr = await RoundRobin.findOneAndUpdate({ key: 'wa_inbound' }, { $setOnInsert: { lastIndex: -1 } }, { upsert: true, new: true });
                  const nextIndex = ((rr?.lastIndex ?? -1) + 1) % agents.length;
                  const agent = agents[nextIndex];
                  await RoundRobin.updateOne({ key: 'wa_inbound' }, { $set: { lastIndex: nextIndex } });
                  ca = new ChatAssignment({ jid, assignedTo: agent._id, firstMessageAt: new Date() });
                  await ca.save();
                }
              }
            } else if (!ca.firstMessageAt) {
              ca.firstMessageAt = new Date();
              await ca.save();
            }
          } catch (err) { try { console.error('[wa] assign error', err?.message || err) } catch { } }
        })();
      }
    }
  });

  sock.ev.on('messages.update', async ({ updates }) => {
    const io = getIO();
    if (!io) return console.error('[wa] socket.io instance not available in messages.update');

    for (const up of updates || []) {
      const jid = up?.key?.remoteJid;
      const id = up?.key?.id;
      if (!jid || !id) continue;
      const arr = messages.get(jid);
      const idx = Array.isArray(arr) ? arr.findIndex(x => x?.key?.id === id) : -1;
      // Map ack codes to statuses (escalate-only): 1=sent, 2=delivered, 3+=read
      const s = (up && (up.status ?? up.update?.status));
      let newStatus = null;
      if (typeof s === 'number'){
        if (s >= 3) newStatus = 'read';
        else if (s >= 2) newStatus = 'delivered';
        else if (s >= 1) newStatus = 'sent';
      }

      if (idx >= 0) {
        if (newStatus) {
          const order = { sent: 1, delivered: 2, read: 3 };
          const curr = arr[idx].status || 'sent';
          if ((order[newStatus] || 0) > (order[curr] || 0)) {
            arr[idx].status = newStatus;
            messages.set(jid, arr);
            io.emit('message.status', { jid, id, status: newStatus });
            try{ await WaMessage.updateOne({ jid, 'key.id': id }, { $set: { status: newStatus } }) }catch{}
          }
        }
      } else if (newStatus) {
        // Cache pending status to apply when upsert arrives
        pendingStatus.set(String(id), { jid, status: newStatus });
      }
    }
  });

  sock.ev.on('message-receipt.update', async (updates) => {
    const io = getIO();
    if (!io) return console.error('[wa] socket.io instance not available in message-receipt.update');

    const list = Array.isArray(updates) ? updates : [updates];
    for (const u of list) {
      const jid = u?.key?.remoteJid;
      const id = u?.key?.id;
      if (!jid || !id) continue;
      const arr = messages.get(jid);
      if (!arr) continue;
      const idx = arr.findIndex(x => x?.key?.id === id);
      if (idx >= 0) {
        const rec = u.receipt || u;
        let newStatus = null;
        if (rec.playedTimestamp) newStatus = 'read';
        else if (rec.readTimestamp) newStatus = 'read';
        else if (rec.receiptTimestamp) newStatus = 'delivered';
        if (newStatus) {
          const order = { sent: 1, delivered: 2, read: 3 };
          const curr = arr[idx].status || 'sent';
          if ((order[newStatus] || 0) > (order[curr] || 0)) {
            arr[idx].status = newStatus;
            messages.set(jid, arr);
            io.emit('message.status', { jid, id, status: newStatus });
            try{ await WaMessage.updateOne({ jid, 'key.id': id }, { $set: { status: newStatus } }) }catch{}
          }
        }
      }
    }
  });

  sock.ev.on('chats.set', ({ chats: initialChats }) => {
    try {
      for (const c of initialChats || []) {
        const jid = c?.id;
        if (!jid) continue;
        const name = c?.name || c?.subject || String(jid).replace(/@.*/, '');
        const existing = chats.get(jid) || { id: jid, name, unreadCount: 0 };
        existing.name = name || existing.name;
        chats.set(jid, existing);
      }
    } catch (err) { try { console.error('[wa] chats.set error', err?.message || err) } catch { } }
  });

  sock.ev.on('chats.upsert', (up) => {
    try {
      const arr = Array.isArray(up) ? up : (up?.chats || []);
      for (const c of arr) {
        const jid = c?.id;
        if (!jid) continue;
        const name = c?.name || c?.subject || String(jid).replace(/@.*/, '');
        const existing = chats.get(jid) || { id: jid, name, unreadCount: 0 };
        existing.name = name || existing.name;
        chats.set(jid, existing);
      }
    } catch (err) { try { console.error('[wa] chats.upsert error', err?.message || err) } catch { } }
  });

  sock.ev.on('chats.update', (updates) => {
    try {
      for (const u of updates || []) {
        const jid = u?.id;
        if (!jid) continue;
        const name = u?.name || u?.subject;
        if (!chats.has(jid)) chats.set(jid, { id: jid, name: String(jid).replace(/@.*/, ''), unreadCount: 0 });
        if (name) chats.get(jid).name = name;
      }
    } catch (err) { try { console.error('[wa] chats.update error', err?.message || err) } catch { } }
  });

    return sock;
  })();
  try {
    return await connectPromise;
  } finally {
    connectPromise = null;
  }
}

async function getStatus() {
  // Auto-initialize if valid credentials exist on disk and no active socket.
  // This keeps the session connected across app/page reloads.
  try{
    if (!(sock && sock.user)){
      const credsPath = path.join(AUTH_DIR, 'creds.json')
      if (fs.existsSync(credsPath)){
        try{ await ensureSock() }catch{}
      }
    }
  }catch{}
  return { connected: !!(sock && sock.user), number: connectedNumber };
}

async function startConnection() {
  await ensureSock();
  if (qrString) {
    const dataUrl = await QRCode.toDataURL(qrString);
    return { qr: dataUrl };
  }
  return { message: 'waiting for QR' };
}

async function getQR() {
  if (!qrString) return { qr: null };
  const dataUrl = await QRCode.toDataURL(qrString);
  return { qr: dataUrl };
}

async function logout() {
  const num = connectedNumber
  try { if (sock) await sock.logout(); } catch { }
  try { fs.rmSync(AUTH_DIR, { recursive: true, force: true }); } catch { }
  try{
    if (num){
      const WaSessionMod = await import('../models/WaSession.js')
      const WaSession = WaSessionMod.default || WaSessionMod
      const phone = String(num||'').replace(/[^0-9]/g,'')
      await WaSession.updateMany({ phone, active: true }, { $set: { active: false, disconnectedAt: new Date() } })
    }
  }catch(e){ try{ console.warn('[wa] session log (logout) failed', e?.message||e) }catch{} }
  sock = null; saveCreds = null; qrString = null; connectedNumber = null;
  return { ok: true };
}

function sse(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  // This endpoint is now deprecated in favor of WebSockets,
  // but we'll keep it for now to avoid breaking old clients.
  // It will no longer receive live events.
  const send = (type, data) => {
    res.write(`event: ${type}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  };

  getStatus().then(st => send('status', st));
  if (qrString) {
    QRCode.toDataURL(qrString).then(qr => send('qr', { qr })).catch(() => { });
  }

  req.on('close', () => {
    res.end();
  });
}

async function listChats() {
  // Do not auto-connect here; use existing in-memory/DB data to avoid
  // triggering reconnection loops due to frequent polling.
  // Seed chat list from in-memory map
  const list = new Map(Array.from(chats.entries())); // jid -> chat

  // Additionally, include any chats known from assignments/meta so the UI
  // shows them immediately after a server restart (before new messages arrive).
  try {
    // Pull assigned chats so agents see their queue even if memory store is empty
    const assigned = await ChatAssignment.find({}, 'jid').lean();
    for (const a of assigned) {
      const jid = a?.jid;
      if (!jid) continue;
      if (!list.has(jid)) {
        list.set(jid, { id: jid, name: jid.replace(/@.*/, ''), unreadCount: 0 });
      }
    }

    // Pull metas to surface any manually assigned chats as well
    const metas = await ChatMeta.find({}, 'jid').lean?.() || [];
    for (const m of metas) {
      const jid = m?.jid;
      if (!jid) continue;
      if (!list.has(jid)) {
        list.set(jid, { id: jid, name: jid.replace(/@.*/, ''), unreadCount: 0 });
      }
    }
  } catch (_e) { /* best-effort enrichment */ }

  // Also enrich from persisted messages so chats appear after restart
  try{
    const fromDb = await WaMessage.aggregate([
      { $group: { _id: '$jid', lastTs: { $max: '$messageTimestamp' } } },
      { $sort: { lastTs: -1 } },
      { $limit: 500 }
    ]);
    for (const d of fromDb){
      const jid = d?._id; if (!jid) continue;
      if (!list.has(jid)) list.set(jid, { id: jid, name: String(jid).replace(/@.*/, ''), unreadCount: 0 });
      const c = list.get(jid);
      c.lastTs = (typeof d.lastTs === 'number') ? (d.lastTs*1000) : c.lastTs;
      list.set(jid, c);
    }
  }catch{ /* ignore */ }

  return Array.from(list.values());
}

async function getMessages(jid, limit = 25, beforeId = null) {
  // Do not auto-connect for reads; serve from memory/DB only.
  const arr = messages.get(jid) || [];
  // Start with memory window
  let memEnd = arr.length;
  if (beforeId){
    const idx = arr.findIndex(x => x?.key?.id === beforeId);
    memEnd = idx >= 0 ? idx : arr.length;
  }
  const memStart = Math.max(0, memEnd - limit);
  let items = arr.slice(memStart, memEnd);

  // If we still need more, pull older ones from DB
  if (items.length < limit){
    try{
      const need = limit - items.length;
      const q = { jid };
      if (beforeId){
        const marker = await WaMessage.findOne({ jid, 'key.id': beforeId }).lean();
        if (marker && typeof marker.messageTimestamp === 'number'){
          q.messageTimestamp = { $lt: marker.messageTimestamp };
        }
      } else if (items.length){
        const oldest = items[0];
        const ts = Number(oldest?.messageTimestamp || 0);
        if (ts > 0) q.messageTimestamp = { $lt: ts };
      }
      const docs = await WaMessage.find(q).sort({ messageTimestamp: -1, _id: -1 }).limit(need).lean();
      const dbMsgs = docs.map(doc => ({
        key: { id: doc?.key?.id, fromMe: !!doc?.key?.fromMe },
        message: doc.message,
        pushName: doc.pushName,
        messageTimestamp: doc.messageTimestamp,
        fromMe: !!doc.fromMe,
        status: doc.status || (doc.fromMe ? 'sent' : undefined),
      }));
      // Prepend older DB messages so result stays ascending
      items = [...dbMsgs.reverse(), ...items];
    }catch{ /* ignore DB failures */ }
  }

  const hasMore = (items.length >= limit) || (memStart > 0);
  const nextBeforeId = items.length ? (items[0]?.key?.id || null) : null;
  return { items, hasMore, nextBeforeId };
}

// Small helper: wait briefly for socket to reach connected state
async function waitForConnected(timeoutMs = 2000, tickMs = 150){
  const end = Date.now() + Math.max(0, timeoutMs);
  while (Date.now() < end){
    if (sock && sock.user) return true;
    await new Promise(r => setTimeout(r, tickMs));
  }
  return !!(sock && sock.user);
}

async function sendText(jid, text) {
  const s = await ensureSock();
  if (!s?.user){
    // allow a brief window for the connection to settle after (re)link
    const ok = await waitForConnected(12000, 250);
    if (!ok) throw new Error('wa-not-connected');
  }
  const njid = normalizeJid(jid);
  if (!njid) throw new Error('invalid-jid');
  // Guard: avoid confusion when sending to self account
  try{
    const selfJid = connectedNumber ? `${String(connectedNumber).replace(/[^0-9]/g, '')}@s.whatsapp.net` : null;
    if (selfJid && njid === selfJid) {
      console.warn('[sendText] target equals connected account; delivery/read may be inconsistent');
    }
  }catch{}
  // Validate number exists on WhatsApp (best-effort) for 1:1 chats only
  if (String(njid).endsWith('@s.whatsapp.net')){
    try{
      const info = await s.onWhatsApp(njid);
      if (Array.isArray(info) && info.length && info[0] && info[0].jid){
        if (info[0].exists === false) throw new Error('wa-number-not-registered');
      }
    }catch(e){
      if (String(e?.message||'').includes('wa-number-not-registered')){
        throw new Error('wa-number-not-registered');
      }
      // ignore lookup errors and attempt send anyway
    }
  }
  try {
    await s.sendMessage(njid, { text });
  } catch (err) {
    try {
      console.error('[sendText] sendMessage failed', { jid: njid, message: err?.message || err });
    } catch {}
    const msg = String(err?.message || '');
    // If the socket abruptly closed, attempt a quick reconnect and one retry
    if (/connection closed|socket is not open|not open/i.test(msg)) {
      try { await ensureSock(); } catch {}
      // brief wait to allow connection to re-open
      await new Promise(r => setTimeout(r, 2000));
      const st = await getStatus();
      if (st?.connected && sock) {
        try {
          await sock.sendMessage(njid, { text });
        } catch (_err2) {
          const e2 = String(_err2?.message || '');
          if (/connection closed|socket is not open|not open/i.test(e2)){
            // Status says connected but send path says closed: surface as transient
            throw new Error('send-transient:connection-closed');
          }
          throw new Error(`send-failed:${e2 || 'unknown'}`);
        }
      } else {
        throw new Error('wa-not-connected');
      }
    } else {
      throw new Error(`send-failed:${err?.message || 'unknown'}`);
    }
  }
  // mark first response time if not set
  try {
    const ca = await ChatAssignment.findOne({ jid: njid });
    if (ca && !ca.firstResponseAt) { ca.firstResponseAt = new Date(); await ca.save(); }
  } catch (_) { }
  return { ok: true };
}

async function sendDocument(jid, filePath, fileName = null, caption = '') {
  const s = await ensureSock();
  if (!s?.user) throw new Error('wa-not-connected');
  const njid = normalizeJid(jid);
  if (!njid) throw new Error('invalid-jid');
  const buffer = fs.readFileSync(filePath);
  const name = fileName || path.basename(filePath);
  const mimetype = mime.lookup(name) || 'application/octet-stream';
  await s.sendMessage(njid, { document: buffer, mimetype, fileName: name, caption });
  // mark first response time if not set
  try {
    const ca = await ChatAssignment.findOne({ jid: njid });
    if (ca && !ca.firstResponseAt) { ca.firstResponseAt = new Date(); await ca.save(); }
  } catch (_) { }
  return { ok: true };
}

async function sendMedia(jid, files) {
  const s = await ensureSock();
  if (!s?.user) throw new Error('wa-not-connected');
  const njid = normalizeJid(jid);
  if (!njid) throw new Error('invalid-jid');
  for (const f of files) {
    let mimeType = f.mimetype || mime.lookup(f.originalname) || 'application/octet-stream';
    const fileName = f.originalname;
    try {
      // Buffer-first for reliability
      let buffer = fs.readFileSync(f.path);
      // Convert HEIC/HEIF/AVIF to JPEG for WA compatibility (optional, if sharp is available)
      if (/^image\/(heic|heif|avif)$/i.test(mimeType)){
        try{
          const mod = await import('sharp');
          const sharp = mod?.default || mod;
          if (typeof sharp === 'function'){
            buffer = await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
            mimeType = 'image/jpeg';
          }
        }catch(errConv){ try{ console.warn('[sendMedia] image convert fallback', { fileName, from: f.mimetype, to: 'image/jpeg', err: errConv?.message||errConv }) }catch{} }
      }
      if (mimeType.startsWith('image/')) await s.sendMessage(njid, { image: buffer, mimetype: mimeType }, { upload: s.waUploadToServer });
      else if (mimeType.startsWith('video/')) await s.sendMessage(njid, { video: buffer, mimetype: mimeType }, { upload: s.waUploadToServer });
      else if (mimeType.startsWith('audio/')) await s.sendMessage(njid, { audio: buffer, mimetype: mimeType, ptt: false }, { upload: s.waUploadToServer });
      else await s.sendMessage(njid, { document: buffer, mimetype: mimeType, fileName }, { upload: s.waUploadToServer });
    } catch (err) {
      // Fallback to file path if buffer send fails in this environment
      try {
        if (mimeType.startsWith('image/')) await s.sendMessage(njid, { image: { url: f.path }, mimetype: mimeType }, { upload: s.waUploadToServer });
        else if (mimeType.startsWith('video/')) await s.sendMessage(njid, { video: { url: f.path }, mimetype: mimeType }, { upload: s.waUploadToServer });
        else if (mimeType.startsWith('audio/')) await s.sendMessage(njid, { audio: { url: f.path }, mimetype: mimeType, ptt: false }, { upload: s.waUploadToServer });
        else await s.sendMessage(njid, { document: { url: f.path }, mimetype: mimeType, fileName }, { upload: s.waUploadToServer });
      } catch (err2) {
        try { console.error('[sendMedia] failed to send media', { fileName, mimeType, err: err2?.message || err2 }) } catch {}
        throw err2;
      }
    } finally {
      try { fs.unlinkSync(f.path); } catch { }
    }
  }
  // mark first response time if not set
  try {
    const ca = await ChatAssignment.findOne({ jid: njid });
    if (ca && !ca.firstResponseAt) { ca.firstResponseAt = new Date(); await ca.save(); }
  } catch (_) { }
  return { ok: true };
}

async function sendVoice(jid, file) {
  const s = await ensureSock();
  if (!s?.user) {
    // Mirror sendText behavior: allow a brief window for the connection to settle
    const ok = await waitForConnected(12000, 250)
    if (!ok) {
      const err = new Error('wa-not-connected')
      try { console.warn('[sendVoice] aborted: WhatsApp not connected'); } catch { }
      throw err
    }
  }
  const njid = normalizeJid(jid);
  if (!njid) throw new Error('invalid-jid');
  // Prevent accidental self-send (often confusing in tests). We still allow if explicitly requested via env.
  const selfJid = connectedNumber ? `${String(connectedNumber).replace(/[^0-9]/g, '')}@s.whatsapp.net` : null;
  if (selfJid && njid === selfJid) {
    console.warn('[sendVoice] target equals connected account; sending may not appear as expected on the same device');
  }
  // Validate number exists on WhatsApp (best-effort) for 1:1 chats only
  if (String(njid).endsWith('@s.whatsapp.net')){
    try{
      const info = await s.onWhatsApp(njid);
      if (Array.isArray(info) && info.length && info[0] && info[0].jid){
        if (info[0].exists === false) throw new Error('wa-number-not-registered');
      }
    }catch(e){
      if (String(e?.message||'').includes('wa-number-not-registered')){
        throw new Error('wa-number-not-registered');
      }
      // ignore lookup errors and attempt send anyway
    }
  }
  let inputPath = file.path;
  let outputPath = null;
  let usedFfmpeg = false;
  let estSeconds = null;
  let echoedMsg = null; // message we immediately reflected to clients
  // optional cancel token carried on file object by route
  const token = file?.voiceToken || null;
  if (token) { voiceJobs.set(token, { canceled: false, proc: null }); }

  // Diagnostic
  try {
    const st = fs.statSync(inputPath);
    console.log('[sendVoice] input', { jid: njid, mimetype: file.mimetype, originalname: file.originalname, bytes: st.size });
  } catch { }

  // Always try to transcode to OGG/Opus for WA PTT reliability (unless disabled via env)
  const disableFfmpeg = String(process.env.WA_DISABLE_FFMPEG || '').toLowerCase() === 'true'
  if (!disableFfmpeg) {
    try {
      // Prefer a user-provided ffmpeg path (e.g., brew-installed) to avoid macOS Gatekeeper prompts
      let ffmpegPath = process.env.WA_FFMPEG_PATH || null
      if (!ffmpegPath) {
        const ffmpegModule = await import('ffmpeg-static');
        ffmpegPath = ffmpegModule?.default || ffmpegModule;
      }
      if (ffmpegPath) {
        const tmpDir = path.join(os.tmpdir(), 'buysial-wa');
        try { fs.mkdirSync(tmpDir, { recursive: true }); } catch { }
        outputPath = path.join(tmpDir, `voice-${Date.now()}.ogg`);
        await new Promise((resolve, reject) => {
          const args = [
            '-y',
            '-i', inputPath,
            '-vn',
            '-acodec', 'libopus',
            '-b:a', '32k',
            '-ar', '16000',
            '-ac', '1',
            outputPath
          ];
          const child = execFile(ffmpegPath, args, (err) => err ? reject(err) : resolve());
          if (token) { const job = voiceJobs.get(token); if (job) job.proc = child; }
        });
        // if canceled during transcode, stop now
        if (token) { const job = voiceJobs.get(token); if (job?.canceled) { try { fs.unlinkSync(outputPath); } catch { }; throw new Error('voice-canceled'); } }
        usedFfmpeg = true;
        try {
          const st = fs.statSync(outputPath);
          // With 32kbps (~4000 bytes/sec) target, estimate duration for WA UI
          estSeconds = Math.max(1, Math.round(st.size / 4000));
          console.log('[sendVoice] transcoded output', { bytes: st.size, estSeconds });
        } catch { }
      }
    } catch (_e) {
      // Try a lighter remux if libopus not available: copy existing Opus stream into OGG container
      try{
        let ffmpegPath = process.env.WA_FFMPEG_PATH || null
        if (!ffmpegPath) ffmpegPath = (await import('ffmpeg-static')).default;
        if (ffmpegPath && file?.mimetype && /audio\/webm/i.test(file.mimetype)){
          const tmpDir = path.join(os.tmpdir(), 'buysial-wa');
          try { fs.mkdirSync(tmpDir, { recursive: true }); } catch { }
          outputPath = path.join(tmpDir, `voice-${Date.now()}.ogg`);
          await new Promise((resolve, reject) => {
            const args = [ '-y', '-i', inputPath, '-vn', '-c:a', 'copy', '-f', 'ogg', outputPath ];
            const child = execFile(ffmpegPath, args, (err) => err ? reject(err) : resolve());
            if (token) { const job = voiceJobs.get(token); if (job) job.proc = child; }
          });
          if (token) { const job = voiceJobs.get(token); if (job?.canceled) { try { fs.unlinkSync(outputPath); } catch { }; throw new Error('voice-canceled'); } }
          usedFfmpeg = true;
          try { const st = fs.statSync(outputPath); estSeconds = Math.max(1, Math.round(st.size / 4000)); } catch { }
        }
      }catch{ /* final fallback handled below */ }
    }
  }

  try {
    if (token) { const job = voiceJobs.get(token); if (job?.canceled) { throw new Error('voice-canceled'); } }
    const sendPath = usedFfmpeg && outputPath ? outputPath : inputPath;
    // Prefer Opus/OGG when transcoded; otherwise attempt sending original as PTT first
    const origMime = file.mimetype || mime.lookup(file.originalname) || 'application/octet-stream';
    const mimeType = usedFfmpeg ? 'audio/ogg; codecs=opus' : origMime;
    console.log('[sendVoice] sending', { jid: njid, mimetype: mimeType, usedFfmpeg });
    try {
      const audioBuffer = fs.readFileSync(sendPath);
      const payload = { audio: audioBuffer, mimetype: mimeType, ptt: true };
      if (usedFfmpeg && typeof estSeconds === 'number' && estSeconds > 0) payload.seconds = estSeconds;
      const sent = await s.sendMessage(njid, payload, { upload: s.waUploadToServer });
      console.log('[sendVoice] sent OK', { jid: njid });
      // Immediately reflect in in-memory store and DB (don't wait for upsert)
      try{
        const io = getIO();
        const arr = messages.get(njid) || [];
        const msgTs = Math.floor(Date.now()/1000);
        const newMsg = {
          key: { id: String(sent?.key?.id || 'v-'+Date.now()), fromMe: true },
          message: sent?.message || { audioMessage: { mimetype: mimeType, seconds: (typeof estSeconds==='number'? estSeconds : undefined) } },
          pushName: '',
          messageTimestamp: msgTs,
          fromMe: true,
          status: 'sent'
        }
        echoedMsg = newMsg;
        arr.push(newMsg); if (arr.length>200) arr.shift(); messages.set(njid, arr);
        // Update chat preview/lastTs
        const existing = chats.get(njid) || { id: njid, name: njid.replace(/@.*/, ''), unreadCount: 0 };
        existing.preview = '[voice]'; existing.lastTs = Date.now(); chats.set(njid, existing);
        // Persist best-effort
        try{
          await WaMessage.updateOne(
            { jid: njid, 'key.id': newMsg.key.id },
            { $set: {
              jid: njid,
              key: newMsg.key,
              fromMe: true,
              message: newMsg.message,
              pushName: newMsg.pushName,
              messageTimestamp: newMsg.messageTimestamp,
              status: newMsg.status,
            }},
            { upsert: true }
          )
        }catch(_dbErr){ try{ console.warn('[sendVoice] DB upsert warn', _dbErr?.message||_dbErr) }catch{} }
        // Emit to clients
        try{ io && io.emit('message.new', { jid: njid, message: newMsg }) }catch{}
      }catch(_e){ /* ignore */ }
    } catch (err) {
      const msg = String(err?.message || '');
      // If the socket abruptly closed, attempt a quick reconnect and one retry
      if (/connection closed|socket is not open|not open/i.test(msg)) {
        try { await ensureSock(); } catch {}
        await new Promise(r => setTimeout(r, 2000));
        const st = await getStatus();
        if (st?.connected && sock) {
          try {
            const audioBuffer = fs.readFileSync(sendPath);
            const payload = { audio: audioBuffer, mimetype: mimeType, ptt: true };
            if (usedFfmpeg && typeof estSeconds === 'number' && estSeconds > 0) payload.seconds = estSeconds;
            const sent = await sock.sendMessage(njid, payload, { upload: sock.waUploadToServer });
            console.log('[sendVoice] retry after reconnect OK', { jid: njid });
            // Reflect immediately after retry success
            try{
              const io = getIO();
              const arr = messages.get(njid) || [];
              const msgTs = Math.floor(Date.now()/1000);
              const newMsg = {
                key: { id: String(sent?.key?.id || 'v-'+Date.now()), fromMe: true },
                message: sent?.message || { audioMessage: { mimetype: mimeType, seconds: (typeof estSeconds==='number'? estSeconds : undefined) } },
                pushName: '',
                messageTimestamp: msgTs,
                fromMe: true,
                status: 'sent'
              }
              echoedMsg = newMsg;
              arr.push(newMsg); if (arr.length>200) arr.shift(); messages.set(njid, arr);
              const existing = chats.get(njid) || { id: njid, name: njid.replace(/@.*/, ''), unreadCount: 0 };
              existing.preview='[voice]'; existing.lastTs=Date.now(); chats.set(njid, existing);
              try{
                await WaMessage.updateOne(
                  { jid: njid, 'key.id': newMsg.key.id },
                  { $set: { jid: njid, key: newMsg.key, fromMe: true, message: newMsg.message, pushName: newMsg.pushName, messageTimestamp: newMsg.messageTimestamp, status: newMsg.status } },
                  { upsert: true }
                )
              }catch(_dbErr){ try{ console.warn('[sendVoice] DB upsert warn', _dbErr?.message||_dbErr) }catch{} }
              try{ io && io.emit('message.new', { jid: njid, message: newMsg }) }catch{}
            }catch{}
          } catch (_err2) {
            const e2 = String(_err2?.message || '');
            if (/connection closed|socket is not open|not open/i.test(e2)){
              // Status says connected but send path says closed: surface as transient
              throw new Error('send-transient:connection-closed');
            }
            throw new Error(`send-failed:${e2 || 'unknown'}`);
          }
        } else {
          throw new Error('wa-not-connected');
        }
        // retry succeeded
        return;
      }

      // Non-connection failure: fallback to document with a clean filename
      try {
        console.warn('[sendVoice] audio send failed, falling back to document', err?.message || err);
        const buf = fs.readFileSync(sendPath);
        const parsed = path.parse(file.originalname || 'voice');
        const cleanBase = (parsed.name || 'voice').replace(/\s+/g, '_');
        let ext = parsed.ext || '';
        if (!ext) {
          if (/webm/i.test(mimeType)) ext = '.webm';
          else if (/ogg/i.test(mimeType)) ext = '.ogg';
          else if (/mp4|m4a/i.test(mimeType)) ext = '.m4a';
          else ext = '.bin';
        }
        const safeName = `${cleanBase}${ext}`;
        await s.sendMessage(njid, { document: buf, mimetype: mimeType, fileName: safeName }, { upload: s.waUploadToServer });
        console.log('[sendVoice] fallback document sent OK', { jid: njid, fileName: safeName });
      } catch (err2) {
        console.error('[sendVoice] fallback document also failed', err2?.message || err2);
        // Final fallback: attempt path upload as voice
        try{
          const alt = { audio: { url: sendPath }, mimetype: mimeType, ptt: true };
          if (usedFfmpeg && typeof estSeconds === 'number' && estSeconds > 0) alt.seconds = estSeconds;
          await s.sendMessage(njid, alt, { upload: s.waUploadToServer });
          console.log('[sendVoice] final fallback path upload sent OK', { jid: njid });
        }catch(err3){
          throw err3;
        }
      }
    }
  } finally {
    try { fs.unlinkSync(inputPath); } catch { }
    if (usedFfmpeg && outputPath) { try { fs.unlinkSync(outputPath); } catch { } }
    if (token) { voiceJobs.delete(token); }
  }
  // mark first response time if not set
  try {
    const ca = await ChatAssignment.findOne({ jid: njid });
    if (ca && !ca.firstResponseAt) { ca.firstResponseAt = new Date(); await ca.save(); }
  } catch (_) { }
  return { ok: true };
}

function cancelVoice(token) {
  const job = voiceJobs.get(token);
  if (!job) { return { ok: false, message: 'no in-flight job' }; }
  job.canceled = true;
  try { job.proc?.kill?.('SIGKILL'); } catch { }
  return { ok: true };
}

async function getMedia(jid, id) {
  // Avoid auto-connecting for media fetches to prevent reconnect storms under load
  if (!(sock && sock.user)) {
    return null;
  }
  // Try memory first
  let m = (messages.get(jid) || []).find(x => x?.key?.id === id);
  // Fallback to DB
  if (!m){
    try{ const doc = await WaMessage.findOne({ jid, 'key.id': id }).lean(); if (doc) m = { key: { id: doc.key?.id, fromMe: doc.key?.fromMe }, message: doc.message, messageTimestamp: doc.messageTimestamp, fromMe: !!doc.fromMe, status: doc.status } }catch{}
  }
  if (!m) return null;
  // Determine which message type has media
  const msg = m.message || {};
  let node, type, fileName;
  if (msg.imageMessage) { node = msg.imageMessage; type = 'image'; }
  else if (msg.videoMessage) { node = msg.videoMessage; type = 'video'; }
  else if (msg.audioMessage) { node = msg.audioMessage; type = 'audio'; }
  else if (msg.documentMessage) { node = msg.documentMessage; type = 'document'; fileName = msg.documentMessage.fileName; }
  if (!node) return null;

  // Attempt actual download within a global concurrency guard
  try{
    const { buffer } = await withMediaSlot(async () => {
      const stream = await downloadContentFromMessage(node, type);
      const timeoutMs = Number(process.env.WA_MEDIA_TIMEOUT_MS || DEFAULT_MEDIA_TIMEOUT_MS);
      const buf = await readStreamWithTimeout(stream, timeoutMs);
      return { buffer: buf }
    })
    const mimeType = node.mimetype || (fileName ? mime.lookup(fileName) : 'application/octet-stream') || 'application/octet-stream';
    return { buffer, mimeType, fileName };
  }catch(err){
    const msg = String(err?.message || '')
    // On timeout or transient download failure, try to serve a lightweight thumbnail for images only
    if (type === 'image'){
      try{
        const thumb = toBufferMaybe(node?.jpegThumbnail || node?.thumbnail)
        if (thumb && thumb.length){
          return { buffer: thumb, mimeType: 'image/jpeg', fileName: fileName || null }
        }
      }catch{}
    }
    // For video/audio/document, rethrow so caller can decide (route returns 204 or 404)
    throw err
  }
}

// Return lightweight media metadata without downloading content
// { hasMedia: boolean, type?: 'image'|'video'|'audio'|'document', fileName?: string|null, mimeType?: string|null, fileLength?: number|undefined }
async function getMediaMeta(jid, id) {
  // Do not auto-connect; this endpoint should work from memory/DB to avoid reconnect storms
  // Try memory first
  let m = (messages.get(jid) || []).find(x => x?.key?.id === id);
  // Fallback to DB
  if (!m){
    try{ const doc = await WaMessage.findOne({ jid, 'key.id': id }).lean(); if (doc) m = { key: { id: doc.key?.id, fromMe: doc.key?.fromMe }, message: doc.message, messageTimestamp: doc.messageTimestamp, fromMe: !!doc.fromMe, status: doc.status } }catch{}
  }
  if (!m) return { hasMedia: false };
  const msg = m.message || {};
  let node = null, type = null, fileName = null, mimeType = null, fileLength = undefined;
  if (msg.imageMessage) { node = msg.imageMessage; type = 'image'; }
  else if (msg.videoMessage) { node = msg.videoMessage; type = 'video'; }
  else if (msg.audioMessage) { node = msg.audioMessage; type = 'audio'; }
  else if (msg.documentMessage) { node = msg.documentMessage; type = 'document'; fileName = msg.documentMessage.fileName || null; }
  if (!node) return { hasMedia: false };
  try{ mimeType = node.mimetype || (fileName ? (mime.lookup(fileName) || null) : null) || null }catch{}
  try{ if (typeof node.fileLength === 'number') fileLength = Number(node.fileLength) }catch{}
  return { hasMedia: true, type, fileName, mimeType, fileLength };
}

function normalizeJid(input) {
  if (!input) return null;
  const s = String(input).trim();
  // Preserve known JID domains
  if (/@(s\.whatsapp\.net|g\.us|broadcast|newsletter)$/i.test(s)) {
    // For 1:1 chats, sanitize digits; for others, keep as-is
    if (s.endsWith('@s.whatsapp.net')){
      const digits = s.replace(/[^0-9]/g, '');
      return digits ? `${digits}@s.whatsapp.net` : null;
    }
    // Groups/broadcast/newsletter: assume server-provided JIDs are valid
    return s;
  }
  // Plain phone input -> assume 1:1 number
  const digits = s.replace(/[^0-9]/g, '');
  if (!digits) return null;
  return `${digits}@s.whatsapp.net`;
}

function getConnectedNumber() { return connectedNumber; }

async function markRead(jid){
  try{
    const c = chats.get(jid)
    if (c){ c.unreadCount = 0; c.unread = false; chats.set(jid, c) }
    const io = getIO();
    if (io) io.emit('chat.read', { jid })
    return { ok: true }
  }catch(_e){ return { ok: false } }
}

export default {
  getStatus,
  startConnection,
  getQR,
  logout,
  sse,
  listChats,
  getMessages,
  sendText,
  sendDocument,
  sendMedia,
  sendVoice,
  cancelVoice,
  getMedia,
  getMediaMeta,
  normalizeJid,
  getConnectedNumber,
  markRead,
};
