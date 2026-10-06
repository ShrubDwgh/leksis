import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase.js'
import { useAuth } from '../auth.jsx'
import { Badge, Field, Logo, Notice } from '../ui.jsx'

export function Profile() {
  const { user, profile, refresh, signOut } = useAuth()
  const [name, setName] = useState(profile.full_name)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    const n = name.trim()
    if (n.length < 2) return setMsg({ kind: 'err', text: 'Nama minimal 2 karakter.' })
    setBusy(true)
    const { error } = await supabase.from('profiles').update({ full_name: n }).eq('id', user.id)
    setBusy(false)
    if (error) return setMsg({ kind: 'err', text: error.message })
    refresh()
    setMsg({ kind: 'ok', text: 'Profil tersimpan.' })
  }

  return (
    <>
      <h1>Profil</h1>
      <form onSubmit={save}>
        <Field label="Nama lengkap">
          <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input value={user.email || ''} disabled />
        </Field>
        <p>
          Peran: <Badge>{profile.role === 'guru' ? 'Guru' : 'Siswa'}</Badge>
        </p>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button className="btn" disabled={busy}>
          Simpan perubahan
        </button>
      </form>
      <ul className="list" style={{ marginTop: '1.5rem' }}>
        <li>
          <Link className="item" to="/pengaturan">
            <span className="grow">Pengaturan</span>
          </Link>
        </li>
      </ul>
      <button className="btn danger" onClick={signOut}>
        Keluar
      </button>
    </>
  )
}

export function Settings() {
  const [pw, setPw] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches

  async function change(e) {
    e.preventDefault()
    if (pw.length < 8) return setMsg({ kind: 'err', text: 'Kata sandi minimal 8 karakter.' })
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setMsg({ kind: 'err', text: error.message })
    setPw('')
    setMsg({ kind: 'ok', text: 'Kata sandi diganti.' })
  }

  async function install() {
    const p = window.__installPrompt
    if (!p) return setMsg({ kind: '', text: 'Buka menu browser (⋮) lalu pilih "Pasang aplikasi" atau "Tambahkan ke layar utama".' })
    p.prompt()
    window.__installPrompt = null
  }

  return (
    <>
      <Link to="/profil" className="small back">
        ← Profil
      </Link>
      <h1>Pengaturan</h1>
      <div className="sec">
        <h2>Ganti kata sandi</h2>
      </div>
      <form onSubmit={change}>
        <Field label="Kata sandi baru" hint="Minimal 8 karakter.">
          <input type="password" autoComplete="new-password" minLength={8} value={pw} onChange={(e) => setPw(e.target.value)} required />
        </Field>
        <button className="btn" disabled={busy}>
          Ganti kata sandi
        </button>
      </form>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="sec">
        <h2>Aplikasi</h2>
      </div>
      {standalone ? (
        <p className="muted">Leksis sudah berjalan sebagai aplikasi.</p>
      ) : (
        <button className="btn alt" onClick={install}>
          Pasang Leksis di layar utama
        </button>
      )}
    </>
  )
}

export function Unauthorized() {
  return (
    <div className="center">
      <h1>Tidak punya akses</h1>
      <p className="muted">Halaman ini hanya untuk peran yang berbeda dari akun Anda.</p>
      <Link className="btn" to="/dashboard">
        Ke beranda
      </Link>
    </div>
  )
}

export function NotFound() {
  return (
    <div className="authbox center">
      <Logo size={48} />
      <h1>Halaman tidak ditemukan</h1>
      <p className="muted">Alamat yang Anda buka tidak ada atau sudah dipindahkan.</p>
      <Link className="btn" to="/dashboard">
        Ke beranda
      </Link>
    </div>
  )
}
