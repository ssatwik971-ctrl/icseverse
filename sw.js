// StudyNest service worker: keeps the app shell available offline.
// AI calls, Wikipedia and Puter are never intercepted (they need the network anyway).
const CACHE = 'studynest-v10'
const SHELL = ['./', './index.html', './assets/app.css', './assets/app.js', './assets/auth.js', './assets/auth.css', './auth.html', './404.html', './manifest.webmanifest', './favicon.png', './favicon-32.png', './icon-192.png', './apple-touch-icon.png']

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.allSettled(SHELL.map(u => c.add(u)))).then(() => self.skipWaiting()))
})
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()))
})
self.addEventListener('fetch', e => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  const same = url.origin === self.location.origin
  const katex = url.hostname === 'cdnjs.cloudflare.com' && url.pathname.includes('/KaTeX/')
  if (!same && !katex) return
  if (same && (url.pathname.startsWith('/.netlify/') || url.pathname.startsWith('/api/'))) return
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) } return res })
        .catch(() => caches.match(req).then(r => r || caches.match('./index.html')))
    )
    return
  }
  // Scripts: network first, so a new deploy never runs with an old cached script.
  if (same && req.destination === 'script') {
    e.respondWith(
      fetch(req)
        .then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) } return res })
        .catch(() => caches.match(req))
    )
    return
  }
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)) }
        return res
      }).catch(() => hit)
      return hit || net
    })
  )
})
