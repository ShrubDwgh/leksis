import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useAuth } from '../auth.jsx'
import { Field, Loading, Logo, Notice } from '../ui.jsx'

function Shell({ title, children, foot }) {
  return (
    <div className="authbox">
      <Link to="/" className="brand">
        <Logo /> Leksis
      </Link>
      <h1>{title}</h1>
      {children}
      <p className="small muted" style={{ marginTop: '1.2rem' }}>
        {foot}
      </p>
    </div>
  )
}

export function Landing() {
  const { session } = useAuth()
  return (
    <div className="land">
      <div className="land-top">
        <span className="brand">
          <Logo /> Leksis
        </span>
        <Link className="btn ghost sm" to={session ? '/dashboard' : '/login'}>
          {session ? 'Buka beranda' : 'Masuk'}
        </Link>
      </div>
      <section className="hero">
        <h1>Ruang kelas digital untuk guru dan siswa.</h1>
        <p>
          Guru membuat kelas, membagikan materi, memberi tugas, dan menyelenggarakan ujian. Siswa bergabung dengan satu
          kode, belajar, mengerjakan, lalu melihat hasilnya.
        </p>
        <div className="row" style={{ marginTop: '1.2rem' }}>
          <Link className="btn" to="/register">
            Buat akun
          </Link>
          <Link className="btn alt" to="/login">
            Masuk
          </Link>
        </div>
      </section>
      <ul className="points">
        <li>
          <b>Bergabung dengan kode kelas</b>
          Tanpa undangan satu per satu. Siswa cukup memasukkan kode enam karakter dari guru.
        </li>
        <li>
          <b>Ujian dengan soal bervariasi</b>
          Pilihan ganda, benar/salah, jawaban singkat, dan essay, lengkap dengan durasi, jadwal, dan batas percobaan.
        </li>
        <li>
          <b>Jawaban tersimpan otomatis</b>
          Halaman ter-refresh atau sinyal putus, pengerjaan dilanjutkan dari jawaban terakhir.
        </li>
        <li>
          <b>Nilai yang dikendalikan guru</b>
          Soal pilihan ganda dan jawaban singkat dinilai otomatis di server. Guru memutuskan kapan nilai tampil.
        </li>
      </ul>
      <p className="foot">Leksis dapat dipasang di layar utama HP seperti aplikasi biasa.</p>
    </div>
  )
}

export function Login() {
  const { session } = useAuth()
  const loc = useLocation()
  const [email, setEmail] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (session) return <Navigate to={loc.state?.from?.pathname || '/dashboard'} replace />

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: pw })
    setBusy(false)
    if (error) setErr(/confirm/i.test(error.message) ? 'Email belum dikonfirmasi. Cek kotak masuk Anda.' : 'Email atau kata sandi salah.')
  }

  return (
    <Shell
      title="Masuk"
      foot={
        <>
          Belum punya akun? <Link to="/register">Buat akun</Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <Field label="Email">
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Kata sandi">
          <input type="password" autoComplete="current-password" required value={pw} onChange={(e) => setPw(e.target.value)} />
        </Field>
        {err && <Notice kind="err">{err}</Notice>}
        <button className="btn" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Masuk…' : 'Masuk'}
        </button>
      </form>
      <p className="small">
        <Link to="/forgot-password">Lupa kata sandi?</Link>
      </p>
    </Shell>
  )
}

export function Register() {
  const { session } = useAuth()
  const [f, setF] = useState({ name: '', email: '', pw: '', role: 'siswa' })
  const [err, setErr] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  if (session) return <Navigate to="/dashboard" replace />
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault()
    setErr('')
    const name = f.name.trim()
    if (name.length < 2) return setErr('Nama lengkap minimal 2 karakter.')
    if (f.pw.length < 8) return setErr('Kata sandi minimal 8 karakter.')
    setBusy(true)
    const { data, error } = await supabase.auth.signUp({
      email: f.email.trim(),
      password: f.pw,
      options: { data: { full_name: name, role: f.role }, emailRedirectTo: `${window.location.origin}/login` },
    })
    setBusy(false)
    if (error) return setErr(error.message)
    if (!data.session) setSent(true) // menunggu konfirmasi email
  }

  if (sent)
    return (
      <Shell title="Cek email Anda" foot={<Link to="/login">Kembali ke halaman masuk</Link>}>
        <Notice kind="ok">Kami mengirim tautan konfirmasi ke {f.email}. Buka tautan itu, lalu masuk.</Notice>
      </Shell>
    )

  return (
    <Shell
      title="Buat akun"
      foot={
        <>
          Sudah punya akun? <Link to="/login">Masuk</Link>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="seg2" role="group" aria-label="Saya mendaftar sebagai">
          {[
            ['siswa', 'Saya siswa'],
            ['guru', 'Saya guru'],
          ].map(([v, l]) => (
            <button type="button" key={v} className={f.role === v ? 'on' : ''} onClick={() => setF({ ...f, role: v })}>
              {l}
            </button>
          ))}
        </div>
        <Field label="Nama lengkap">
          <input autoComplete="name" required maxLength={100} value={f.name} onChange={set('name')} />
        </Field>
        <Field label="Email">
          <input type="email" autoComplete="email" required value={f.email} onChange={set('email')} />
        </Field>
        <Field label="Kata sandi" hint="Minimal 8 karakter.">
          <input type="password" autoComplete="new-password" required minLength={8} value={f.pw} onChange={set('pw')} />
        </Field>
        {err && <Notice kind="err">{err}</Notice>}
        <button className="btn" disabled={busy} style={{ width: '100%' }}>
          {busy ? 'Membuat akun…' : 'Buat akun'}
        </button>
      </form>
    </Shell>
  )
}

export function Forgot() {
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setBusy(true)
    setErr('')
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    setBusy(false)
    if (error && /rate|limit/i.test(error.message)) return setErr('Terlalu sering mencoba. Tunggu beberapa menit.')
    setDone(true) // sengaja tidak memberi tahu apakah email terdaftar
  }

  return (
    <Shell title="Lupa kata sandi" foot={<Link to="/login">Kembali ke halaman masuk</Link>}>
      {done ? (
        <Notice kind="ok">Jika email terdaftar, tautan untuk mengatur ulang kata sandi sudah dikirim.</Notice>
      ) : (
        <form onSubmit={submit}>
          <Field label="Email akun">
            <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {err && <Notice kind="err">{err}</Notice>}
          <button className="btn" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Mengirim…' : 'Kirim tautan'}
          </button>
        </form>
      )}
    </Shell>
  )
}

export function Reset() {
  const { session, loading } = useAuth()
  const nav = useNavigate()
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (loading) return <Loading full />

  async function submit(e) {
    e.preventDefault()
    if (pw.length < 8) return setErr('Kata sandi minimal 8 karakter.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setErr(error.message)
    nav('/dashboard', { replace: true })
  }

  return (
    <Shell title="Atur kata sandi baru" foot={<Link to="/login">Ke halaman masuk</Link>}>
      {!session ? (
        <Notice kind="err">Tautan tidak valid atau sudah kedaluwarsa. Minta tautan baru di halaman Lupa kata sandi.</Notice>
      ) : (
        <form onSubmit={submit}>
          <Field label="Kata sandi baru" hint="Minimal 8 karakter.">
            <input type="password" autoComplete="new-password" required minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} />
          </Field>
          {err && <Notice kind="err">{err}</Notice>}
          <button className="btn" disabled={busy} style={{ width: '100%' }}>
            {busy ? 'Menyimpan…' : 'Simpan kata sandi'}
          </button>
        </form>
      )}
    </Shell>
  )
}
