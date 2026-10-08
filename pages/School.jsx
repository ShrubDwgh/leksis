import { useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, q } from '../supabase.js'
import { useAuth } from '../auth.jsx'
import { Back, Badge, Empty, ErrorBox, Field, Loading, Notice, fmt, useLoad } from '../ui.jsx'
import { ColorField } from './Branding.jsx'
import { FONT_LABELS, isHex } from '../theme.jsx'

const ROLE = { school_admin: 'Admin', teacher: 'Guru', student: 'Siswa', parent: 'Orang tua', super_admin: 'Super admin' }
const count = async (table, build) => {
  const { count: n, error } = await build(supabase.from(table).select('id', { count: 'exact', head: true }))
  if (error) throw new Error(error.message)
  return n || 0
}
const copy = (text, setMsg) => {
  if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => setMsg('Disalin'), () => setMsg('Salin manual'))
  else setMsg('Salin manual')
}

function CodeRow({ label, code, kind, onChange }) {
  const [msg, setMsg] = useState('')
  async function regen() {
    if (!window.confirm('Buat kode baru? Kode lama tidak berlaku lagi.')) return
    const { error } = await supabase.rpc('regenerate_school_code', { p_kind: kind })
    if (error) setMsg(error.message)
    else onChange()
  }
  return (
    <li className="item">
      <div className="grow">
        <span className="small muted">{label}</span>
        <b>
          <span className="code" style={{ background: 'var(--cyan-soft)', color: 'var(--ink)' }}>
            {code}
          </span>
        </b>
        {msg && <span className="small muted">{msg}</span>}
      </div>
      <button className="btn sm alt" onClick={() => copy(code, setMsg)}>
        Salin
      </button>
      <button className="btn sm alt" onClick={regen}>
        Kode baru
      </button>
    </li>
  )
}

export function AdminHome() {
  const { profile } = useAuth()
  const sid = profile.school_id
  const [form, setForm] = useState(null)
  const [msg, setMsg] = useState(null)
  const { data, error, loading, reload } = useLoad(async () => {
    const school = await q(supabase.from('schools').select('id,name,slug,address,teacher_code,student_code').eq('id', sid).maybeSingle())
    if (!school) throw new Error('Sekolah tidak ditemukan.')
    const [year, classes, teachers, students, parents] = await Promise.all([
      q(supabase.from('academic_years').select('year_name,semester').eq('school_id', sid).eq('is_active', true).maybeSingle()),
      count('classes', (b) => b.eq('school_id', sid)),
      count('profiles', (b) => b.eq('school_id', sid).in('role', ['teacher', 'school_admin'])),
      count('profiles', (b) => b.eq('school_id', sid).eq('role', 'student')),
      count('profiles', (b) => b.eq('school_id', sid).eq('role', 'parent')),
    ])
    return { school, year, classes, teachers, students, parents }
  }, [sid])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const { school, year, classes, teachers, students, parents } = data
  const f = form || { name: school.name, address: school.address }
  const loginUrl = `${window.location.origin}/sekolah/${school.slug}`

  async function saveInfo(e) {
    e.preventDefault()
    if (f.name.trim().length < 2) return setMsg({ kind: 'err', text: 'Nama sekolah minimal 2 karakter.' })
    const { error: er } = await supabase.from('schools').update({ name: f.name.trim(), address: f.address }).eq('id', sid)
    if (er) return setMsg({ kind: 'err', text: er.message })
    setMsg({ kind: 'ok', text: 'Data sekolah tersimpan.' })
    setForm(null)
    reload()
  }

  return (
    <>
      <h1>{school.name}</h1>
      <p className="muted small">{year ? `Tahun ajaran aktif: ${year.year_name} ${year.semester}` : 'Belum ada tahun ajaran aktif.'}</p>
      <div className="stats">
        <div className="stat"><b>{classes}</b><span>Kelas</span></div>
        <div className="stat"><b>{teachers}</b><span>Guru & admin</span></div>
        <div className="stat"><b>{students}</b><span>Siswa</span></div>
        <div className="stat"><b>{parents}</b><span>Orang tua</span></div>
      </div>

      <div className="sec"><h2>Kelola sekolah</h2></div>
      <ul className="list">
        {[
          ['/kelas', 'Kelas', 'Buat kelas dan tetapkan guru'],
          ['/admin/tahun', 'Tahun ajaran', 'Tahun dan semester aktif'],
          ['/admin/mapel', 'Mata pelajaran', 'Daftar mapel sekolah'],
          ['/jadwal', 'Jadwal pelajaran', 'Jadwal per kelas'],
          ['/absensi', 'Absensi', 'Kehadiran siswa per kelas'],
          ['/admin/pengguna', 'Pengguna', 'Guru, siswa, orang tua'],
          ['/admin/settings/branding', 'Branding sekolah', 'Logo, warna, halaman login'],
        ].map(([to, t, d]) => (
          <li key={to}>
            <Link className="item" to={to}>
              <div className="grow">
                <b>{t}</b>
                <span className="small muted">{d}</span>
              </div>
              <span aria-hidden="true">›</span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="sec"><h2>Kode undangan</h2></div>
      <p className="small muted">Bagikan kode ke guru dan siswa. Mereka memasukkannya saat mendaftar atau di halaman Profil.</p>
      <ul className="list">
        <CodeRow label="Kode guru" code={school.teacher_code} kind="teacher" onChange={reload} />
        <CodeRow label="Kode siswa" code={school.student_code} kind="student" onChange={reload} />
      </ul>
      <p className="small muted">
        Halaman masuk sekolah: <a href={loginUrl}>{loginUrl}</a>
      </p>

      <div className="sec"><h2>Data sekolah</h2></div>
      <form onSubmit={saveInfo}>
        <Field label="Nama resmi sekolah">
          <input required maxLength={150} value={f.name} onChange={(e) => setForm({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Alamat">
          <textarea style={{ minHeight: 70 }} maxLength={300} value={f.address} onChange={(e) => setForm({ ...f, address: e.target.value })} />
        </Field>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button className="btn">Simpan</button>
      </form>
    </>
  )
}

export function AdminYears() {
  const { profile } = useAuth()
  const sid = profile.school_id
  const [f, setF] = useState({ name: '', sem: 'Ganjil' })
  const [err, setErr] = useState('')
  const { data, error, loading, reload } = useLoad(
    () => q(supabase.from('academic_years').select('id,year_name,semester,is_active').eq('school_id', sid).order('year_name', { ascending: false }).order('semester')),
    [sid]
  )
  async function add(e) {
    e.preventDefault()
    setErr('')
    if (!/^\d{4}\/\d{4}$/.test(f.name.trim())) return setErr('Format tahun ajaran: 2025/2026')
    try {
      await q(supabase.from('academic_years').insert({ school_id: sid, year_name: f.name.trim(), semester: f.sem }))
      setF({ name: '', sem: f.sem })
      reload()
    } catch (e2) {
      setErr(e2.message.includes('duplicate') ? 'Tahun ajaran dan semester itu sudah ada.' : e2.message)
    }
  }
  async function act(fn) {
    setErr('')
    try {
      await fn()
      reload()
    } catch (e2) {
      setErr(e2.message)
    }
  }
  return (
    <>
      <Back to="/admin">Sekolah</Back>
      <h1>Tahun ajaran</h1>
      <form onSubmit={add} className="row" style={{ margin: '1rem 0' }}>
        <input className="grow" placeholder="2025/2026" aria-label="Tahun ajaran" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <select style={{ width: 'auto' }} value={f.sem} onChange={(e) => setF({ ...f, sem: e.target.value })} aria-label="Semester">
          <option>Ganjil</option>
          <option>Genap</option>
        </select>
        <button className="btn">Tambah</button>
      </form>
      {err && <Notice kind="err">{err}</Notice>}
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : data.length ? (
        <ul className="list">
          {data.map((y) => (
            <li key={y.id} className="item">
              <div className="grow">
                <b>{y.year_name} · {y.semester}</b>
                {y.is_active && <Badge tone="ok">Aktif</Badge>}
              </div>
              {!y.is_active && (
                <button className="btn sm alt" onClick={() => act(async () => { const { error: er } = await supabase.rpc('set_active_year', { p_year: y.id }); if (er) throw new Error(er.message) })}>
                  Jadikan aktif
                </button>
              )}
              <button className="btn sm danger" onClick={() => window.confirm('Hapus tahun ajaran ini? Kelas yang memakainya menjadi tanpa tahun ajaran.') && act(() => q(supabase.from('academic_years').delete().eq('id', y.id)))}>
                Hapus
              </button>
            </li>
          ))}
        </ul>
      ) : <Empty>Belum ada tahun ajaran.</Empty>}
    </>
  )
}

export function AdminSubjects() {
  const { profile } = useAuth()
  const sid = profile.school_id
  const [f, setF] = useState({ name: '', code: '' })
  const [err, setErr] = useState('')
  const { data, error, loading, reload } = useLoad(() => q(supabase.from('subjects').select('id,name,code').eq('school_id', sid).order('name')), [sid])
  async function add(e) {
    e.preventDefault()
    setErr('')
    try {
      await q(supabase.from('subjects').insert({ school_id: sid, name: f.name.trim(), code: f.code.trim() || null }))
      setF({ name: '', code: '' })
      reload()
    } catch (e2) {
      setErr(e2.message.includes('duplicate') ? 'Kode mapel itu sudah dipakai.' : e2.message)
    }
  }
  async function del(id) {
    if (!window.confirm('Hapus mata pelajaran ini?')) return
    try {
      await q(supabase.from('subjects').delete().eq('id', id))
      reload()
    } catch (e2) {
      setErr(e2.message)
    }
  }
  return (
    <>
      <Back to="/admin">Sekolah</Back>
      <h1>Mata pelajaran</h1>
      <form onSubmit={add} className="row" style={{ margin: '1rem 0' }}>
        <input className="grow" placeholder="Nama mapel" aria-label="Nama mapel" maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required minLength={2} />
        <input style={{ width: 90 }} placeholder="Kode" aria-label="Kode" maxLength={20} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} />
        <button className="btn">Tambah</button>
      </form>
      {err && <Notice kind="err">{err}</Notice>}
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : data.length ? (
        <ul className="list">
          {data.map((s) => (
            <li key={s.id} className="item">
              <div className="grow">
                <b>{s.name}</b>
                {s.code && <span className="small muted">{s.code}</span>}
              </div>
              <button className="btn sm danger" onClick={() => del(s.id)}>Hapus</button>
            </li>
          ))}
        </ul>
      ) : <Empty>Belum ada mata pelajaran.</Empty>}
    </>
  )
}

function UserRow({ u, me, reload, setErr }) {
  const [edit, setEdit] = useState(false)
  const [f, setF] = useState({ name: u.full_name, nis: u.nis || '', role: u.role })
  const isAdmin = u.role === 'school_admin'
  async function save() {
    const { error } = await supabase.rpc('admin_set_user', { p_user: u.id, p_name: f.name, p_nis: f.nis, p_role: f.role })
    if (error) return setErr(error.message)
    setEdit(false)
    reload()
  }
  async function remove() {
    if (!window.confirm(`Keluarkan ${u.full_name || 'pengguna ini'} dari sekolah?`)) return
    const { error } = await supabase.rpc('admin_remove_user', { p_user: u.id })
    if (error) return setErr(error.message)
    reload()
  }
  return (
    <li className="item col">
      <div className="between">
        <div>
          <b>{u.full_name || '(tanpa nama)'}</b>
          <span className="small muted">{u.nis ? `NIS ${u.nis}` : ' '}</span>
        </div>
        <Badge tone={isAdmin ? 'warn' : ''}>{ROLE[u.role]}</Badge>
      </div>
      {edit ? (
        <>
          <input aria-label="Nama" maxLength={100} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          <input aria-label="NIS" placeholder="NIS / NIP" maxLength={30} value={f.nis} onChange={(e) => setF({ ...f, nis: e.target.value })} />
          {!isAdmin && (
            <select aria-label="Peran" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
              <option value="student">Siswa</option>
              <option value="teacher">Guru</option>
              <option value="parent">Orang tua</option>
            </select>
          )}
          <div className="row">
            <button className="btn sm" onClick={save}>Simpan</button>
            <button className="btn sm alt" onClick={() => setEdit(false)}>Batal</button>
          </div>
        </>
      ) : (
        <div className="row">
          <button className="btn sm alt" onClick={() => setEdit(true)}>Edit</button>
          {!isAdmin && u.id !== me && <button className="btn sm danger" onClick={remove}>Keluarkan</button>}
        </div>
      )}
    </li>
  )
}

export function AdminUsers() {
  const { profile, user } = useAuth()
  const sid = profile.school_id
  const [role, setRole] = useState('all')
  const [err, setErr] = useState('')
  const { data, error, loading, reload } = useLoad(() => q(supabase.from('profiles').select('id,full_name,role,nis').eq('school_id', sid).order('full_name')), [sid])
  const shown = (data || []).filter((u) => role === 'all' || u.role === role)
  return (
    <>
      <Back to="/admin">Sekolah</Back>
      <h1>Pengguna</h1>
      <div className="chips" style={{ margin: '.8rem 0' }}>
        {[['all', 'Semua'], ['teacher', 'Guru'], ['student', 'Siswa'], ['parent', 'Orang tua']].map(([v, l]) => (
          <button key={v} className={`chip ${role === v ? 'on' : ''}`} onClick={() => setRole(v)}>{l}</button>
        ))}
      </div>
      {err && <Notice kind="err">{err}</Notice>}
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : shown.length ? (
        <ul className="list">
          {shown.map((u) => <UserRow key={u.id} u={u} me={user.id} reload={reload} setErr={setErr} />)}
        </ul>
      ) : <Empty>Belum ada pengguna di kelompok ini. Bagikan kode undangan dari halaman Sekolah.</Empty>}
    </>
  )
}

/* ---------------- Super admin: pengaturan platform ---------------- */
export function PlatformAdmin() {
  const [msg, setMsg] = useState(null)
  const [f, setF] = useState(null)
  const { data, error, loading, reload } = useLoad(async () => {
    const [schools, def] = await Promise.all([
      q(supabase.from('schools').select('id,name,slug,created_at').order('created_at', { ascending: false })),
      q(supabase.from('platform_branding').select('*').eq('id', 1).maybeSingle()),
    ])
    return { schools, def }
  }, [])
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const d = f || data.def
  const set = (k) => (v) => setF({ ...d, [k]: v && v.target ? v.target.value : v })

  async function save(e) {
    e.preventDefault()
    if (![d.primary_color, d.secondary_color, d.accent_color].every(isHex)) return setMsg({ kind: 'err', text: 'Warna harus format #RRGGBB.' })
    const { id, updated_at, ...rest } = d // eslint-disable-line no-unused-vars
    const { error: er } = await supabase.from('platform_branding').update(rest).eq('id', 1)
    if (er) return setMsg({ kind: 'err', text: er.message })
    setMsg({ kind: 'ok', text: 'Branding default disimpan. Berlaku untuk sekolah yang dibuat setelah ini.' })
    setF(null)
    reload()
  }
  async function del(s) {
    if (window.prompt(`Menghapus sekolah menghapus semua datanya. Ketik nama sekolah untuk konfirmasi:\n${s.name}`) !== s.name) return
    const { error: er } = await supabase.from('schools').delete().eq('id', s.id)
    if (er) setMsg({ kind: 'err', text: er.message })
    else reload()
  }
  return (
    <>
      <h1>Platform</h1>
      <div className="sec"><h2>Sekolah ({data.schools.length})</h2></div>
      {data.schools.length ? (
        <ul className="list">
          {data.schools.map((s) => (
            <li key={s.id} className="item">
              <div className="grow">
                <b>{s.name}</b>
                <span className="small muted">/sekolah/{s.slug} · dibuat {fmt(s.created_at)}</span>
              </div>
              <button className="btn sm danger" onClick={() => del(s)}>Hapus</button>
            </li>
          ))}
        </ul>
      ) : <Empty>Belum ada sekolah.</Empty>}

      <div className="sec"><h2>Branding default sekolah baru</h2></div>
      <form onSubmit={save}>
        <ColorField label="Warna utama" value={d.primary_color} onChange={set('primary_color')} />
        <ColorField label="Warna sekunder" value={d.secondary_color} onChange={set('secondary_color')} />
        <ColorField label="Warna aksen" value={d.accent_color} onChange={set('accent_color')} />
        <Field label="Font">
          <select value={d.font_family} onChange={set('font_family')}>
            {Object.entries(FONT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Mode tema">
          <select value={d.theme_mode} onChange={set('theme_mode')}>
            <option value="light">Terang</option>
            <option value="dark">Gelap</option>
            <option value="system">Ikuti perangkat</option>
          </select>
        </Field>
        <Field label="Pesan sambutan login">
          <textarea style={{ minHeight: 70 }} maxLength={500} value={d.login_message || ''} onChange={set('login_message')} />
        </Field>
        <Field label="Teks footer">
          <input maxLength={300} value={d.footer_text || ''} onChange={set('footer_text')} />
        </Field>
        {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
        <button className="btn">Simpan default</button>
      </form>
      <p className="small muted" style={{ marginTop: '1.5rem' }}>
        Peran super admin hanya bisa diberikan lewat SQL Editor Supabase (lihat README). Super admin tidak bisa membaca data kelas, nilai, atau ujian sekolah.
      </p>
    </>
  )
}
