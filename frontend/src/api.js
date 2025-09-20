export const API_BASE = (() => {
  const raw = import.meta.env.VITE_API_BASE ?? ''
  let base = String(raw).trim()
  // Treat empty or '/' as same-origin root
  if (base === '' || base === '/') base = ''
  // If someone accidentally sets 'http:' or 'https:' (no host), fallback to same-origin
  if (/^https?:\/?$/.test(base)) base = ''
  // Remove trailing slash for consistent concatenation with paths that start with '/'
  if (base.endsWith('/')) base = base.slice(0, -1)
  // Development fallback: if no API base configured, point to local backend
  if (!base && import.meta.env.DEV) {
    return 'http://localhost:4000'
  }
  return base
})();

function authHeader(){
  const token = localStorage.getItem('token');
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

// Best-effort toast helpers (no hard dependency)
function toastError(message){ try{ window.__toast && window.__toast.error && window.__toast.error(message) }catch{} }
function toastInfo(message){ try{ window.__toast && window.__toast.info && window.__toast.info(message) }catch{} }

async function handle(res){
  if (res.ok) return res;
  // Centralize auth failures: clear token and redirect to login
  if (res.status === 401) {
    try { localStorage.removeItem('token'); localStorage.removeItem('me'); } catch {}
    if (!location.pathname.startsWith('/login')) {
      toastError('Your session has expired. Please log in again.')
      location.href = '/login';
    }
  }
  // Prefer JSON error bodies
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')){
    let body = null;
    try{ body = await res.clone().json(); }catch{}
    if (body){
      const msg = body?.error || body?.message || `HTTP ${res.status}`;
      const e = new Error(msg);
      try{ e.status = res.status }catch{}
      try{
        const ra = res.headers.get('retry-after');
        if (ra){
          let ms = 0;
          if (/^\d+$/.test(ra.trim())) ms = parseInt(ra.trim(), 10) * 1000
          else { const when = Date.parse(ra); if (!Number.isNaN(when)) ms = Math.max(0, when - Date.now()) }
          if (ms) e.retryAfterMs = ms
        }
      }catch{}
      // Show a toast for JSON errors (except when login page might intentionally handle)
      const suppressLoginToast = typeof res.url === 'string' && /\/api\/auth\/login(\?|$)/.test(res.url)
      if (!suppressLoginToast){
        if (res.status === 429){ toastInfo(msg || 'Too many requests. Please try again shortly.') }
        else { toastError(msg) }
      }
      throw e;
    }
  }
  // Fallback: text/HTML error pages (reverse proxies or unhandled middleware)
  const raw = await res.text();
  const looksHtml = ct.includes('text/html') || /^\s*<!DOCTYPE|^\s*<html/i.test(raw || '');
  const stripHtml = (s)=> String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  let friendly = '';
  if (res.status === 413) friendly = 'Upload too large. Please try a smaller file.';
  else if (res.status === 502 || res.status === 504) friendly = 'Server temporarily unavailable. Please try again.';
  else if (res.status >= 500) friendly = 'Internal server error. Please try again.';
  const text = looksHtml ? (friendly || `HTTP ${res.status}`) : (stripHtml(raw) || friendly || `HTTP ${res.status}`);
  const e = new Error(text);
  try{ e.status = res.status }catch{}
  try{
    const ra = res.headers.get('retry-after');
    if (ra){
      let ms = 0;
      if (/^\d+$/.test(ra.trim())) ms = parseInt(ra.trim(), 10) * 1000
      else { const when = Date.parse(ra); if (!Number.isNaN(when)) ms = Math.max(0, when - Date.now()) }
      if (ms) e.retryAfterMs = ms
    }
  }catch{}
  const suppressLoginToast = typeof res.url === 'string' && /\/api\/auth\/login(\?|$)/.test(res.url)
  if (!suppressLoginToast){
    if (res.status === 429){ toastInfo(text || 'Too many requests. Please try again shortly.') }
    else { toastError(text) }
  }
  throw e;
}

export async function apiGet(path){
  const res = await fetchWithRetry(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...authHeader() } }, { method: 'GET' });
  await handle(res);
  return res.json();
}

export async function apiPost(path, body){
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeader() }, body: JSON.stringify(body) });
  await handle(res);
  return res.json();
}

export async function apiUpload(path, formData){
  const res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers: { ...authHeader() }, body: formData });
  await handle(res);
  return res.json();
}

export async function apiGetBlob(path){
  const res = await fetchWithRetry(`${API_BASE}${path}`, { headers: { ...authHeader() } }, { method: 'GET' });
  await handle(res);
  return res.blob();
}

export async function apiPatch(path, body){
  const res = await fetch(`${API_BASE}${path}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeader() }, body: JSON.stringify(body) });
  await handle(res);
  return res.json();
}

export async function apiDelete(path){
  const res = await fetch(`${API_BASE}${path}`, { method: 'DELETE', headers: { ...authHeader() } });
  await handle(res);
  return res.json();
}

export async function apiUploadPatch(path, formData){
  const res = await fetch(`${API_BASE}${path}`, { method: 'PATCH', headers: { ...authHeader() }, body: formData });
  await handle(res);
  return res.json();
}

// Internal: retry helper primarily for idempotent GET requests
let __getCooldownUntil = 0
const __routeCooldown = new Map() // key -> until timestamp
async function fetchWithRetry(url, init, opts){
  const method = (opts && opts.method) || (init && init.method) || 'GET'
  const retryable = method.toUpperCase() === 'GET'
  const urlStr = String(url || '')
  const isMsgs = urlStr.includes('/api/wa/messages')
  const isChats = urlStr.includes('/api/wa/chats')
  const maxRetries = retryable ? ((isMsgs || isChats) ? 0 : 3) : 0
  let attempt = 0
  let delay = 400
  while(true){
    // honor global cooldown after recent 429s
    if (retryable && __getCooldownUntil){
      const now = Date.now()
      if (now < __getCooldownUntil){
        await new Promise(r => setTimeout(r, __getCooldownUntil - now))
      }
    }
    // Honor per-route cooldown (per jid) for WA endpoints
    if (retryable && (isMsgs || isChats)){
      try{
        const u = new URL(urlStr, (typeof location!=='undefined'? location.origin : 'http://localhost'))
        const jid = u.searchParams.get('jid') || ''
        const key = (isMsgs? 'msgs:' : 'chats:') + jid
        const until = __routeCooldown.get(key) || 0
        if (until && Date.now() < until){
          await new Promise(r => setTimeout(r, until - Date.now()))
        }
      }catch{}
    }
    const res = await fetch(url, init)
    // If 429 on WA endpoints, set per-route cooldown even if we won't retry
    if (retryable && (isMsgs || isChats) && res.status === 429){
      let waitMs = delay
      try{
        const ra = res.headers.get('retry-after')
        if (ra){
          if (/^\d+$/.test(ra.trim())) waitMs = Math.max(waitMs, parseInt(ra.trim(),10)*1000)
          else { const when = Date.parse(ra); if (!Number.isNaN(when)) waitMs = Math.max(waitMs, when - Date.now()) }
        }
      }catch{}
      const jitter = Math.floor(Math.random()*350)
      __getCooldownUntil = Date.now() + Math.min(Math.max(1500, waitMs) + jitter, 8000)
      try{
        const u = new URL(urlStr, (typeof location!=='undefined'? location.origin : 'http://localhost'))
        const jid = u.searchParams.get('jid') || ''
        const key = (isMsgs? 'msgs:' : 'chats:') + jid
        __routeCooldown.set(key, Date.now() + Math.max(2000, waitMs) + jitter)
      }catch{}
    }
    // Retry on 429/502/503/504 for GETs
    if (retryable && (res.status === 429 || res.status === 502 || res.status === 503 || res.status === 504) && attempt < maxRetries){
      // honor Retry-After header if present
      let waitMs = delay
      try{
        const ra = res.headers.get('retry-after')
        if (ra){
          if (/^\d+$/.test(ra.trim())){
            waitMs = Math.max(waitMs, parseInt(ra.trim(), 10) * 1000)
          } else {
            const when = Date.parse(ra)
            if (!Number.isNaN(when)) waitMs = Math.max(waitMs, when - Date.now())
          }
        }
      }catch{}
      // set a global cooldown so other GETs back off too (jitter to avoid sync)
      const jitter = Math.floor(Math.random()*350)
      __getCooldownUntil = Date.now() + Math.min(Math.max(1500, waitMs) + jitter, 8000)
      // set per-route cooldown for WA endpoints so subsequent loads queue instead of burst
      if (isMsgs || isChats){
        try{
          const u = new URL(urlStr, (typeof location!=='undefined'? location.origin : 'http://localhost'))
          const jid = u.searchParams.get('jid') || ''
          const key = (isMsgs? 'msgs:' : 'chats:') + jid
          __routeCooldown.set(key, Date.now() + Math.max(2000, waitMs) + jitter)
        }catch{}
      }
      await new Promise(r => setTimeout(r, Math.max(200, waitMs)))
      attempt++
      delay = Math.min(delay * 2, 3000)
      continue
    }
    return res
  }
}
