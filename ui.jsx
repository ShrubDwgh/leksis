import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

export function Logo({ size = 28 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
      <rect width="512" height="512" rx="112" fill="#0A2346" />
      <g transform="translate(-22 -1)">
        <path fill="#22C7F2" d="M150 118h60v252h-60z" />
        <path fill="#22C7F2" d="M150 300l116 26v70L150 370z" />
        <path fill="#9BE3F7" d="M278 326l116-26v70l-116 26z" />
        <rect x="300" y="236" width="26" height="26" fill="#22C7F2" />
        <rect x="340" y="204" width="26" height="26" fill="#22C7F2" />
        <rect x="380" y="172" width="26" height="26" fill="#fff" />
      </g>
    </svg>
  )
}

export const Loading = ({ full }) => <div className={full ? 'full muted' : 'center muted'}>Memuat…</div>
export const ErrorBox = ({ error }) => <div className="note err">{String(error)}</div>
export const Notice = ({ kind = '', children }) => <div className={`note ${kind}`}>{children}</div>
export const Empty = ({ children }) => <div className="empty">{children}</div>
export const Badge = ({ tone = '', children }) => <span className={`badge ${tone}`}>{children}</span>
export const Back = ({ to, children }) => (
  <Link to={to} className="small back">
    ← {children}
  </Link>
)
export const Field = ({ label, hint, children }) => (
  <label className="field">
    <span>{label}</span>
    {children}
    {hint && <small>{hint}</small>}
  </label>
)

export const fmt = (d) =>
  d
    ? new Date(d).toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—'
export const toInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
export const fromInput = (v) => (v ? new Date(v).toISOString() : null)
export const pct = (s, m) => (Number(m) > 0 ? Math.round((Number(s) / Number(m)) * 100) : 0)
export const num = (n) => Number(n).toLocaleString('id-ID', { maximumFractionDigits: 2 })
export const safeUrl = (u) => (u && /^https?:\/\//i.test(u) ? u : null)

// Batas waktu pengerjaan ujian (ms) = yang lebih awal antara durasi dan batas akhir; null = tanpa batas.
export function deadlineOf(exam, startedAt) {
  const c = []
  if (exam.duration_minutes) c.push(new Date(startedAt).getTime() + exam.duration_minutes * 60000)
  if (exam.ends_at) c.push(new Date(exam.ends_at).getTime())
  return c.length ? Math.min(...c) : null
}

// Muat data async. reload() memuat ulang tanpa menampilkan "Memuat…" lagi.
export function useLoad(fn, deps) {
  const [s, setS] = useState({ data: null, error: '', loading: true })
  const tick = useRef(0)
  const run = useCallback(async () => {
    const n = ++tick.current
    try {
      const data = await fn()
      if (n === tick.current) setS({ data, error: '', loading: false })
    } catch (e) {
      if (n === tick.current) setS({ data: null, error: e.message || 'Terjadi kesalahan', loading: false })
    }
  }, deps) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setS((x) => (x.loading ? x : { ...x, loading: true }))
    run()
  }, [run])
  return { ...s, reload: run }
}
