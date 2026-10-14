// Service worker de SquadLift
// - Guarda la app en el teléfono para que abra sin internet
// - Recibe notificaciones push
const VERSION = 'sl-v5'
const SHELL = `${VERSION}-shell`
const RUNTIME = `${VERSION}-runtime`
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/icon-192.png', '/icon-512.png', '/apple-touch-icon.png']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter(k => !k.startsWith(VERSION)).map(k => caches.delete(k)))
    await self.clients.claim()
  })())
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)

  // Datos de Supabase: los maneja la app (no se guardan aquí), salvo fotos de perfil públicas
  if (url.hostname.endsWith('supabase.co')) {
    if (url.pathname.includes('/storage/v1/object/public/avatars/')) event.respondWith(cacheFirst(req))
    return
  }

  // Abrir la app: primero internet; sin conexión, la copia guardada
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req)
        const c = await caches.open(SHELL); c.put('/index.html', res.clone())
        return res
      } catch {
        return (await caches.match('/index.html')) || (await caches.match('/')) || Response.error()
      }
    })())
    return
  }

  // Archivos de la app (llevan huella en el nombre): copia local primero
  if (url.origin === self.location.origin && url.pathname.startsWith('/assets/')) { event.respondWith(cacheFirst(req)); return }

  // Fuentes de Google: copia local primero
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { event.respondWith(cacheFirst(req)); return }

  // Resto de archivos propios (íconos, manifest): internet y, si falla, copia
  if (url.origin === self.location.origin) {
    event.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(RUNTIME).then(c => c.put(req, copy)); return res })
      .catch(() => caches.match(req).then(r => r || Response.error())))
  }
})

async function cacheFirst(req) {
  const hit = await caches.match(req)
  if (hit) return hit
  try {
    const res = await fetch(req)
    if (res.ok || res.type === 'opaque') { const c = await caches.open(RUNTIME); c.put(req, res.clone()) }
    return res
  } catch { return Response.error() }
}

// ---------------- notificaciones ----------------
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'SquadLift', body: event.data?.text() } }
  event.waitUntil(self.registration.showNotification(data.title || 'SquadLift', {
    body: data.body || '', icon: '/icon-192.png', badge: '/icon-192.png',
    tag: data.tag || undefined, data: { url: data.url || '/' }
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (c.url.startsWith(self.location.origin)) { await c.focus(); c.postMessage({ type: 'navigate', url }); return }
    }
    await self.clients.openWindow(url)
  })())
})
