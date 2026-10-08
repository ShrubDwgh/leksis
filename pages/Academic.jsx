import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, q } from '../supabase.js'
import { useAuth } from '../auth.jsx'
import { Back, Badge, Empty, ErrorBox, Field, Loading, Notice, fmt, num, pct, useLoad } from '../ui.jsx'

const DAYS = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
const STATUSES = ['Hadir', 'Sakit', 'Izin', 'Alpa']
const hm = (t) => String(t).slice(0, 5)
const pad = (n) => String(n).padStart(2, '0')
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const fmtDay = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const tally = (rows) => STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length])

/* ---------------------------- Jadwal ---------------------------- */
export function Schedule() {
  const { profile, isTeacher, isAdmin, user } = useAuth()
  const sid = profile.school_id
  const [err, setErr] = useState('')
  const [f, setF] = useState({ cls: '', subject: '', teacher: user.id, day: '1', start: '07:00', end: '08:00' })
  const { data, error, loading, reload } = useLoad(async () => {
    const rows = await q(
      supabase
        .from('schedules')
        .select('id,day_of_week,start_time,end_time,class:classes!schedules_class_id_fkey(id,name),subject:subjects!schedules_subject_id_fkey(name),teacher:profiles!schedules_teacher_id_fkey(full_name)')
        .order('day_of_week')
        .order('start_time')
    )
    if (!isTeacher) return { rows, classes: [], subjects: [], teachers: [] }
    const [classes, subjects, teachers] = await Promise.all([
      q(supabase.from('classes').select('id,name').order('name')),
      sid ? q(supabase.from('subjects').select('id,name').eq('school_id', sid).order('name')) : [],
      isAdmin ? q(supabase.from('profiles').select('id,full_name').eq('school_id', sid).in('role', ['teacher', 'school_admin']).order('full_name')) : [],
    ])
    return { rows, classes, subjects, teachers }
  }, [isTeacher, isAdmin, sid])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const { rows, classes, subjects, teachers } = data
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  async function add(e) {
    e.preventDefault()
    setErr('')
    if (!f.cls) return setErr('Pilih kelas.')
    if (f.end <= f.start) return setErr('Jam selesai harus setelah jam mulai.')
    try {
      await q(supabase.from('schedules').insert({ class_id: f.cls, subject_id: f.subject || null, teacher_id: isAdmin ? f.teacher : user.id, day_of_week: Number(f.day), start_time: f.start, end_time: f.end }))
      reload()
    } catch (e2) {
      setErr(e2.message)
    }
  }
  async function del(id) {
    if (!window.confirm('Hapus jadwal ini?')) return
    try {
      await q(supabase.from('schedules').delete().eq('id', id))
      reload()
    } catch (e2) {
      setErr(e2.message)
    }
  }

  return (
    <>
      <h1>Jadwal pelajaran</h1>
      {isTeacher && (
        <form onSubmit={add} style={{ margin: '1rem 0' }}>
          <h2>Tambah jadwal</h2>
          <Field label="Kelas">
            <select value={f.cls} onChange={set('cls')} required>
              <option value="">— pilih kelas —</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          {subjects.length > 0 && (
            <Field label="Mata pelajaran">
              <select value={f.subject} onChange={set('subject')}>
                <option value="">— tidak dipilih —</option>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}
          {isAdmin && (
            <Field label="Guru pengajar">
              <select value={f.teacher} onChange={set('teacher')}>
                {teachers.map((t) => <option key={t.id} value={t.id}>{t.full_name || '(tanpa nama)'}</option>)}
              </select>
            </Field>
          )}
          <Field label="Hari">
            <select value={f.day} onChange={set('day')}>
              {DAYS.slice(1).map((d, i) => <option key={d} value={i + 1}>{d}</option>)}
            </select>
          </Field>
          <div className="row">
            <div className="grow"><Field label="Mulai"><input type="time" value={f.start} onChange={set('start')} required /></Field></div>
            <div className="grow"><Field label="Selesai"><input type="time" value={f.end} onChange={set('end')} required /></Field></div>
          </div>
          {err && <Notice kind="err">{err}</Notice>}
          <button className="btn">Tambah</button>
        </form>
      )}
      {!isTeacher && err && <Notice kind="err">{err}</Notice>}
      {rows.length ? (
        DAYS.slice(1).map((d, i) => {
          const day = rows.filter((r) => r.day_of_week === i + 1)
          if (!day.length) return null
          return (
            <section key={d}>
              <div className="sec"><h2>{d}</h2></div>
              <ul className="list">
                {day.map((r) => (
                  <li key={r.id} className="item">
                    <div className="grow">
                      <b>{r.subject?.name || 'Pelajaran'} · {r.class?.name}</b>
                      <span className="small muted">{hm(r.start_time)}–{hm(r.end_time)}{r.teacher?.full_name ? ` · ${r.teacher.full_name}` : ''}</span>
                    </div>
                    {isTeacher && <button className="btn sm danger" onClick={() => del(r.id)}>Hapus</button>}
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      ) : (
        <Empty>{isTeacher ? 'Belum ada jadwal.' : 'Belum ada jadwal untuk kelas Anda.'}</Empty>
      )}
    </>
  )
}

/* ---------------------------- Absensi ---------------------------- */
export function Attendance() {
  const { isTeacher } = useAuth()
  return isTeacher ? <AttendanceTeacher /> : <AttendanceStudent />
}

function AttendanceTeacher() {
  const [cid, setCid] = useState('')
  const [date, setDate] = useState(localDate())
  const { data, error, loading } = useLoad(() => q(supabase.from('classes').select('id,name').order('name')), [])
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const cls = cid || data[0]?.id || ''
  return (
    <>
      <h1>Absensi</h1>
      {data.length ? (
        <>
          <div className="row" style={{ margin: '1rem 0' }}>
            <select className="grow" value={cls} onChange={(e) => setCid(e.target.value)} aria-label="Kelas">
              {data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input type="date" style={{ width: 'auto' }} value={date} max={localDate()} onChange={(e) => setDate(e.target.value || localDate())} aria-label="Tanggal" />
          </div>
          <AttendanceSheet key={`${cls}|${date}`} cid={cls} date={date} />
        </>
      ) : (
        <Empty>Belum ada kelas. Buat kelas dulu dari menu Kelas.</Empty>
      )}
    </>
  )
}

function AttendanceSheet({ cid, date }) {
  const [rows, setRows] = useState(null)
  const [msg, setMsg] = useState(null)
  const { data, error, loading, reload } = useLoad(async () => {
    const from = new Date()
    from.setDate(from.getDate() - 30)
    const [members, today, recap] = await Promise.all([
      q(supabase.from('class_members').select('student_id,profiles!class_members_student_id_fkey(full_name,nis)').eq('class_id', cid)),
      q(supabase.from('attendances').select('student_id,status,note').eq('class_id', cid).eq('date', date)),
      q(supabase.from('attendances').select('student_id,status').eq('class_id', cid).gte('date', localDate(from))),
    ])
    members.sort((a, b) => (a.profiles?.full_name || '').localeCompare(b.profiles?.full_name || ''))
    return { members, today, recap }
  }, [cid, date])
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const { members, today, recap } = data
  const cur = rows || Object.fromEntries(members.map((m) => [m.student_id, today.find((t) => t.student_id === m.student_id) || { status: 'Hadir', note: '' }]))
  const set = (sid, patch) => setRows({ ...cur, [sid]: { ...cur[sid], ...patch } })

  async function save() {
    setMsg(null)
    const payload = members.map((m) => ({ student_id: m.student_id, status: cur[m.student_id].status, note: cur[m.student_id].note || '' }))
    const { data: n, error: er } = await supabase.rpc('save_attendance', { p_class: cid, p_date: date, p_rows: payload })
    if (er) return setMsg({ kind: 'err', text: er.message })
    setMsg({ kind: 'ok', text: `Absensi ${fmtDay(date)} tersimpan (${n} siswa).` })
    setRows(null)
    reload()
  }

  if (!members.length) return <Empty>Belum ada siswa di kelas ini.</Empty>
  return (
    <>
      <div className="row" style={{ marginBottom: '.5rem' }}>
        <span className="small muted grow">{today.length ? 'Sudah diisi, bisa diubah.' : 'Belum diisi untuk tanggal ini.'}</span>
        <button className="btn sm alt" onClick={() => setRows(Object.fromEntries(members.map((m) => [m.student_id, { status: 'Hadir', note: '' }])))}>Semua hadir</button>
      </div>
      <ul className="list">
        {members.map((m) => (
          <li key={m.student_id} className="item col">
            <b>{m.profiles?.full_name || 'Siswa'} {m.profiles?.nis && <span className="small muted">· {m.profiles.nis}</span>}</b>
            <div className="chips" role="group" aria-label="Status kehadiran">
              {STATUSES.map((s) => (
                <button key={s} type="button" className={`chip ${cur[m.student_id].status === s ? `on s-${s}` : ''}`} onClick={() => set(m.student_id, { status: s })}>{s}</button>
              ))}
            </div>
            {cur[m.student_id].status !== 'Hadir' && (
              <input placeholder="Catatan (opsional)" aria-label="Catatan" maxLength={300} value={cur[m.student_id].note || ''} onChange={(e) => set(m.student_id, { note: e.target.value })} />
            )}
          </li>
        ))}
      </ul>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <button className="btn" onClick={save}>Simpan absensi</button>

      <div className="sec"><h2>Rekap 30 hari terakhir</h2></div>
      <table className="tbl">
        <thead><tr><th>Siswa</th>{STATUSES.map((s) => <th key={s}>{s[0]}</th>)}</tr></thead>
        <tbody>
          {members.map((m) => {
            const mine = recap.filter((r) => r.student_id === m.student_id)
            return <tr key={m.student_id}><td>{m.profiles?.full_name || 'Siswa'}</td>{tally(mine).map(([s, n]) => <td key={s}>{n}</td>)}</tr>
          })}
        </tbody>
      </table>
      <p className="small muted">H = Hadir, S = Sakit, I = Izin, A = Alpa.</p>
    </>
  )
}

function AttendanceList({ rows }) {
  return (
    <>
      <div className="chips" style={{ margin: '.8rem 0' }}>
        {tally(rows).map(([s, n]) => <span key={s} className={`chip on s-${s}`}>{s}: {n}</span>)}
      </div>
      {rows.length ? (
        <ul className="list">
          {rows.map((r) => (
            <li key={r.id} className="item">
              <div className="grow">
                <b>{fmtDay(r.date)}</b>
                <span className="small muted">{r.class?.name}{r.note ? ` · ${r.note}` : ''}</span>
              </div>
              <Badge tone={r.status === 'Hadir' ? 'ok' : r.status === 'Alpa' ? 'err' : 'warn'}>{r.status}</Badge>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Belum ada catatan kehadiran.</Empty>
      )}
    </>
  )
}

const attendanceQuery = (extra) => {
  let b = supabase.from('attendances').select('id,date,status,note,class:classes!attendances_class_id_fkey(name)').order('date', { ascending: false }).limit(90)
  return extra ? extra(b) : b
}

function AttendanceStudent() {
  const { data, error, loading } = useLoad(() => q(attendanceQuery()), [])
  return (
    <>
      <h1>Kehadiran saya</h1>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : <AttendanceList rows={data} />}
    </>
  )
}

/* ---------------------------- Orang tua ---------------------------- */
export function ParentHome() {
  const [code, setCode] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const { data, error, loading, reload } = useLoad(
    () => q(supabase.from('parent_students').select('student_id,child:profiles!parent_students_student_id_fkey(full_name,nis)').order('created_at')),
    []
  )
  async function link(e) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    const { data: nm, error: er } = await supabase.rpc('link_child', { p_code: code })
    setBusy(false)
    if (er) return setMsg({ kind: 'err', text: er.message })
    setMsg({ kind: 'ok', text: `${nm} berhasil dihubungkan.` })
    setCode('')
    reload()
  }
  async function unlink(sid) {
    if (!window.confirm('Putuskan hubungan dengan anak ini?')) return
    const { error: er } = await supabase.from('parent_students').delete().eq('student_id', sid)
    if (er) setMsg({ kind: 'err', text: er.message })
    else reload()
  }
  return (
    <>
      <h1>Anak saya</h1>
      <p className="small muted">Minta anak Anda membuka Profil → Kode orang tua, lalu masukkan kodenya di sini.</p>
      <form onSubmit={link} className="row" style={{ margin: '.8rem 0' }}>
        <input className="grow" placeholder="Kode dari anak" aria-label="Kode orang tua" maxLength={10} required value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        <button className="btn" disabled={busy}>Hubungkan</button>
      </form>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : data.length ? (
        <ul className="list">
          {data.map((c) => (
            <li key={c.student_id} className="item">
              <Link className="grow" to={`/ortu/${c.student_id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                <b>{c.child?.full_name || 'Siswa'}</b>
                <span className="small muted">{c.child?.nis ? `NIS ${c.child.nis}` : 'Lihat kelas, kehadiran, dan nilai'}</span>
              </Link>
              <button className="btn sm danger" onClick={() => unlink(c.student_id)}>Putuskan</button>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>Belum ada anak yang terhubung.</Empty>
      )}
    </>
  )
}

export function ParentChild() {
  const { sid } = useParams()
  const { data, error, loading } = useLoad(async () => {
    const [child, classes, att, grades] = await Promise.all([
      q(supabase.from('profiles').select('id,full_name,nis').eq('id', sid).maybeSingle()),
      q(supabase.from('class_members').select('class_id,class:classes!class_members_class_id_fkey(name,teacher:profiles!classes_teacher_id_fkey(full_name))').eq('student_id', sid)),
      q(attendanceQuery((b) => b.eq('student_id', sid))),
      q(
        supabase
          .from('grades')
          .select('id,score,max_score,graded_at,submissions!grades_submission_id_fkey(exams(title),assignments(title))')
          .eq('student_id', sid)
          .order('graded_at', { ascending: false })
          .limit(30)
      ),
    ])
    if (!child) throw new Error('Data anak tidak ditemukan atau belum terhubung.')
    return { child, classes, att, grades }
  }, [sid])
  if (loading) return <Loading />
  if (error) return <><Back to="/ortu">Anak saya</Back><ErrorBox error={error} /></>
  const { child, classes, att, grades } = data
  return (
    <>
      <Back to="/ortu">Anak saya</Back>
      <h1>{child.full_name}</h1>
      <p className="small muted">{child.nis ? `NIS ${child.nis} · ` : ''}Tampilan hanya-baca.</p>

      <div className="sec"><h2>Kelas</h2></div>
      {classes.length ? (
        <ul className="list">
          {classes.map((c) => (
            <li key={c.class_id} className="item">
              <div className="grow">
                <b>{c.class?.name}</b>
                <span className="small muted">Guru: {c.class?.teacher?.full_name || '—'}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : <Empty>Belum bergabung ke kelas.</Empty>}

      <div className="sec"><h2>Kehadiran</h2></div>
      <AttendanceList rows={att} />

      <div className="sec"><h2>Nilai</h2></div>
      {grades.length ? (
        <ul className="list">
          {grades.map((g) => (
            <li key={g.id} className="item">
              <div className="grow">
                <b>{g.submissions?.exams?.title || g.submissions?.assignments?.title || 'Penilaian'}</b>
                <span className="small muted">{fmt(g.graded_at)}</span>
              </div>
              <Badge tone={pct(g.score, g.max_score) >= 75 ? 'ok' : 'warn'}>{num(g.score)}/{num(g.max_score)}</Badge>
            </li>
          ))}
        </ul>
      ) : <Empty>Belum ada nilai yang ditampilkan guru.</Empty>}
    </>
  )
}
