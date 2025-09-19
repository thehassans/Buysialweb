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

async function handle(res){
  if (res.ok) return res;
  // Centralize auth failures: clear token and redirect to login
  if (res.status === 401) {
    try { localStorage.removeItem('token'); localStorage.removeItem('me'); } catch {}
    if (!location.pathname.startsWith('/login')) {
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
      throw new Error(msg);
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
  throw new Error(text);
}

export async function apiGet(path){
  const res = await fetch(`${API_BASE}${path}`, { headers: { 'Content-Type': 'application/json', ...authHeader() } });
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
  const res = await fetch(`${API_BASE}${path}`, { headers: { ...authHeader() } });
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
