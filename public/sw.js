// Service worker Leksis — hanya menyimpan cache untuk app shell & aset statis milik sendiri.
// Permintaan ke Supabase (lain origin), data akun, nilai, dan jawaban TIDAK PERNAH disentuh/di-cache.
// Naikkan nomor VERSION jika ingin memaksa semua perangkat membuang cache lama.
const VERSION = 'leksis-v2'
const SHELL = ['/', '/manifest.webmanifest', '/favicon.svg', '/favicon.ico', '/icons/icon-192.png', '/icons/icon-512.png']
const STATIC = ['/manifest.webmanifest', '/favicon.svg', '/favicon.ico']

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

async function put(req, res) {
  const cache = await caches.open(VERSION)
  await cache.put(req, res)
  const keys = await cache.keys()
  if (keys.length > 80) await cache.delete(keys[SHELL.length]) // buang aset lama, shell tetap aman
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // Supabase & domain lain: langsung ke jaringan
  if (req.headers.has('authorization')) return

  // Halaman: jaringan dulu supaya selalu terbaru; offline → app shell.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) put('/', res.clone())
          return res
        })
        .catch(() => caches.match('/'))
    )
    return
  }

  const p = url.pathname

  // Aset build ber-hash: cache dulu (isi file tidak pernah berubah untuk nama yang sama).
  if (p.startsWith('/assets/')) {
    e.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) put(req, res.clone())
            return res
          })
      )
    )
    return
  }

  // Ikon, favicon, manifest: tampilkan cache, perbarui di belakang layar.
  if (p.startsWith('/icons/') || STATIC.includes(p)) {
    e.respondWith(
      caches.match(req).then((hit) => {
        const net = fetch(req)
          .then((res) => {
            if (res.ok) put(req, res.clone())
            return res
          })
          .catch(() => hit)
        return hit || net
      })
    )
  }
})
