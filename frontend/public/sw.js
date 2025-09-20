// Minimal service worker for BuySial Commerce
const CACHE_NAME = 'buysial-shell-v1'
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
]

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.map((k) => (k !== CACHE_NAME ? caches.delete(k) : null)))).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // Never cache API calls
  if (url.pathname.startsWith('/api/')) return
  // Cache-first for same-origin GET requests
  if (e.request.method === 'GET' && url.origin === self.location.origin) {
    e.respondWith(
      caches.match(e.request).then((cached) => cached || fetch(e.request))
    )
  }
})
