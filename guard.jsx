import { useEffect, useMemo, useRef, useState } from 'react'

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])
const SEVERE = ['left_page', 'fullscreen_exit', 'screenshot_key', 'resize_shrink', 'devtools_open', 'pip_open']

/*
 * <ExamGuard> — proteksi ujian yang BISA dikontrol browser. Semuanya "best-effort":
 *  - Tidak bisa mendeteksi screenshot HP (Power+Volume), kamera/HP kedua, atau AI di perangkat lain.
 *  - PrintScreen/Win+Shift+S sering ditangkap OS sehingga tidak sampai ke halaman.
 *  - Ctrl+W/T/N tidak bisa diblokir browser; hanya konfirmasi saat tutup tab (beforeunload).
 *  - Deteksi DevTools hanya perkiraan (bisa salah) dan tidak berlaku di HP.
 *  - Fullscreen tidak didukung iPhone (dilewati otomatis).
 *  - Pelanggaran dicatat ke server lewat onViolation; keputusan akhir ada di guru.
 */
export function ExamGuard({ active = true, needFullscreen = true, watermark = '', onViolation, onExitAttempt, children }) {
  const [flags, setFlags] = useState({ blur: false, fs: false, resize: false })
  const cb = useRef(onViolation)
  cb.current = onViolation
  const exitCb = useRef(onExitAttempt)
  exitCb.current = onExitAttempt

  useEffect(() => {
    if (!active) return undefined
    const setF = (k, val) => setFlags((f) => (f[k] === val ? f : { ...f, [k]: val }))
    const fsOk = Boolean(document.documentElement.requestFullscreen) && needFullscreen
    const coarse = Boolean(window.matchMedia && window.matchMedia('(pointer: coarse)').matches)
    const last = {}
    let lastSevere = 0
    const v = (type, details = {}) => {
      const now = Date.now()
      const severe = SEVERE.includes(type)
      if (now - (last[type] || 0) < (severe ? 1500 : 5000)) return
      if (severe) {
        if (now - lastSevere < 1500) return // satu kejadian bisa memicu beberapa event sekaligus → dihitung sekali
        lastSevere = now
      }
      last[type] = now
      if (cb.current) cb.current(type, details)
    }

    // 1) Pindah tab/aplikasi atau jendela kehilangan fokus. <3 detik dianggap wajar (notifikasi, dll).
    let away = null
    const leave = () => {
      if (away === null) {
        away = Date.now()
        setF('blur', true)
      }
    }
    const back = () => {
      if (away === null) return
      const sec = Math.round((Date.now() - away) / 1000)
      away = null
      setF('blur', false)
      v(sec >= 3 ? 'left_page' : 'blur_short', { seconds: sec })
    }
    const vis = () => (document.hidden ? leave() : document.hasFocus() && back())
    window.addEventListener('blur', leave)
    window.addEventListener('focus', back)
    document.addEventListener('visibilitychange', vis)
    if (!document.hasFocus()) leave()

    // 2) Layar penuh
    const fs = () => {
      if (!fsOk) return
      if (!document.fullscreenElement) {
        setF('fs', true)
        v('fullscreen_exit')
      } else setF('fs', false)
    }
    document.addEventListener('fullscreenchange', fs)
    const t0 = setTimeout(() => fsOk && !document.fullscreenElement && setF('fs', true), 600)

    // 3) Jendela menyusut (split screen). Tinggi diabaikan saat mengetik (keyboard HP) dan saat rotasi layar.
    let base = { w: window.innerWidth, h: window.innerHeight }
    let quiet = 0
    let shrunk = false
    const orient = () => {
      quiet = Date.now() + 1200
      setTimeout(() => {
        base = { w: window.innerWidth, h: window.innerHeight }
        shrunk = false
        setF('resize', false)
      }, 1300)
    }
    const rs = () => {
      if (Date.now() < quiet) return
      if (fsOk && !document.fullscreenElement) return // sudah dicatat sebagai keluar layar penuh
      const typing = /^(INPUT|TEXTAREA)$/.test((document.activeElement && document.activeElement.tagName) || '')
      const small = window.innerWidth < base.w * 0.8 || (!typing && window.innerHeight < base.h * 0.75)
      setF('resize', small)
      if (small && !shrunk) v('resize_shrink', { w: window.innerWidth, h: window.innerHeight, base_w: base.w, base_h: base.h })
      shrunk = small
    }
    window.addEventListener('orientationchange', orient)
    window.addEventListener('resize', rs)

    // 4) Tombol: screenshot & pintasan alat pengembang
    const kd = (e) => {
      const k = (e.key || '').toLowerCase()
      const mod = e.ctrlKey || e.metaKey
      if (e.shiftKey && mod && k === 's') {
        e.preventDefault()
        v('screenshot_key', { combo: 'shift+s' })
        return
      }
      if (k === 'f12' || (mod && e.shiftKey && k.length === 1 && 'ijc'.includes(k)) || (mod && ['u', 's', 'p'].includes(k))) {
        e.preventDefault()
        v('shortcut_blocked', { key: k })
      }
    }
    const ku = (e) => e.key === 'PrintScreen' && v('screenshot_key', { key: 'PrintScreen' })
    document.addEventListener('keydown', kd, true)
    document.addEventListener('keyup', ku, true)

    // 5) Copy/cut/klik kanan diblokir di luar kolom isian; paste hanya boleh di essay (data-allow-paste)
    const field = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)
    const noCopy = (e) => {
      if (field(e.target)) return
      e.preventDefault()
      v('copy_attempt')
    }
    const noPaste = (e) => {
      if (e.target && e.target.dataset && e.target.dataset.allowPaste === 'true') return
      e.preventDefault()
      v('paste_attempt')
    }
    const noMenu = (e) => {
      e.preventDefault()
      v('contextmenu')
    }
    document.addEventListener('copy', noCopy)
    document.addEventListener('cut', noCopy)
    document.addEventListener('paste', noPaste)
    document.addEventListener('contextmenu', noMenu)

    // 6) Picture-in-Picture (halaman ujian tidak memakai video; ini hanya pengaman)
    const pip = () => {
      v('pip_open')
      if (document.exitPictureInPicture) document.exitPictureInPicture().catch(() => {})
    }
    document.addEventListener('enterpictureinpicture', pip, true)
    document.querySelectorAll('video').forEach((el) => {
      el.disablePictureInPicture = true
    })

    // 7) DevTools (perkiraan; dilewati di layar sentuh)
    let lastDev = 0
    const dt = setInterval(() => {
      if (coarse || document.hidden) return
      let open = window.outerWidth - window.innerWidth > 160
      if (!open) {
        const t = performance.now()
        debugger // eslint-disable-line no-debugger
        open = performance.now() - t > 100
      }
      if (open && Date.now() - lastDev > 30000) {
        lastDev = Date.now()
        v('devtools_open')
      }
    }, 3000)

    // 8) Tombol back & tutup tab
    window.history.pushState(window.history.state, '', window.location.href)
    const pop = () => {
      window.history.pushState(window.history.state, '', window.location.href)
      v('back_attempt')
      if (exitCb.current) exitCb.current()
    }
    const unload = (e) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('popstate', pop)
    window.addEventListener('beforeunload', unload)

    return () => {
      clearTimeout(t0)
      clearInterval(dt)
      window.removeEventListener('blur', leave)
      window.removeEventListener('focus', back)
      document.removeEventListener('visibilitychange', vis)
      document.removeEventListener('fullscreenchange', fs)
      window.removeEventListener('orientationchange', orient)
      window.removeEventListener('resize', rs)
      document.removeEventListener('keydown', kd, true)
      document.removeEventListener('keyup', ku, true)
      document.removeEventListener('copy', noCopy)
      document.removeEventListener('cut', noCopy)
      document.removeEventListener('paste', noPaste)
      document.removeEventListener('contextmenu', noMenu)
      document.removeEventListener('enterpictureinpicture', pip, true)
      window.removeEventListener('popstate', pop)
      window.removeEventListener('beforeunload', unload)
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {})
    }
  }, [active, needFullscreen])

  // Watermark: Nama - NIS - waktu, transparan di atas soal.
  const bg = useMemo(() => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="380" height="190"><text x="190" y="95" text-anchor="middle" transform="rotate(-22 190 95)" font-family="sans-serif" font-size="15" font-weight="600" fill="#6b7280">${esc(watermark)}</text></svg>`
    return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
  }, [watermark])

  const overlay = active && (flags.fs ? 'fs' : flags.resize ? 'resize' : flags.blur ? 'blur' : null)
  return (
    <div className="guard">
      {children}
      {active && <div className="wm" style={{ backgroundImage: bg }} aria-hidden="true" />}
      {overlay && (
        <div className="guard-overlay" role="alertdialog" aria-live="assertive">
          {overlay === 'fs' && (
            <div>
              <h2>Kembali ke layar penuh</h2>
              <p className="muted">Ujian ini harus dikerjakan dalam mode layar penuh. Soal disembunyikan sampai Anda kembali.</p>
              <button className="btn" onClick={() => document.documentElement.requestFullscreen().catch(() => {})}>
                Masuk layar penuh
              </button>
            </div>
          )}
          {overlay === 'resize' && (
            <div>
              <h2>Silakan kembali ke mode layar penuh</h2>
              <p className="muted">Ukuran jendela berubah (mis. split screen). Tutup aplikasi lain dan kembalikan ukuran jendela.</p>
            </div>
          )}
          {overlay === 'blur' && (
            <div>
              <h2>Kembali ke halaman ujian</h2>
              <p className="muted">Soal disembunyikan selama Anda berada di luar halaman ini. Waktu ujian tetap berjalan.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
