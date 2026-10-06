import { useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase, q } from '../supabase.js'
import { useAuth } from '../auth.jsx'
import { Back, Badge, Empty, ErrorBox, Field, Loading, Notice, fmt, useLoad } from '../ui.jsx'

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % 32]).join('')

export function ClassList() {
  const { isTeacher } = useAuth()
  const nav = useNavigate()
  const { data, error, loading } = useLoad(
    () => q(supabase.from('classes').select('id,name,description,profiles(full_name),class_members(count)').order('created_at', { ascending: false })),
    []
  )
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function join(e) {
    e.preventDefault()
    setErr('')
    setBusy(true)
    try {
      const id = await q(supabase.rpc('join_class', { p_code: code }))
      nav(`/kelas/${id}`)
    } catch (e2) {
      setErr(e2.message)
      setBusy(false)
    }
  }

  return (
    <>
      <div className="between">
        <h1>Kelas</h1>
        {isTeacher && (
          <Link className="btn" to="/kelas/baru">
            + Buat kelas
          </Link>
        )}
      </div>
      {!isTeacher && (
        <form onSubmit={join} className="row" style={{ margin: '1rem 0 .4rem' }}>
          <input
            className="grow"
            placeholder="Kode kelas dari guru"
            aria-label="Kode kelas"
            maxLength={10}
            required
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
          />
          <button className="btn" disabled={busy}>
            Gabung
          </button>
        </form>
      )}
      {err && <Notice kind="err">{err}</Notice>}
      {loading ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} />
      ) : data.length ? (
        <ul className="list">
          {data.map((c) => (
            <li key={c.id}>
              <Link className="item" to={`/kelas/${c.id}`}>
                <div className="grow">
                  <b>{c.name}</b>
                  <span className="small muted">
                    {isTeacher ? `${c.class_members?.[0]?.count || 0} siswa` : `Guru: ${c.profiles?.full_name || '—'}`}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <Empty>{isTeacher ? 'Belum ada kelas. Buat kelas pertama Anda.' : 'Belum ada kelas. Masukkan kode dari guru untuk bergabung.'}</Empty>
      )}
    </>
  )
}

export function ClassForm() {
  const { id } = useParams()
  const { data, error, loading } = useLoad(() => (id ? q(supabase.from('classes').select('*').eq('id', id).maybeSingle()) : Promise.resolve({})), [id])
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return <ErrorBox error="Kelas tidak ditemukan." />
  return <ClassFormInner cls={data} id={id} />
}

function ClassFormInner({ cls, id }) {
  const nav = useNavigate()
  const [name, setName] = useState(cls.name || '')
  const [desc, setDesc] = useState(cls.description || '')
  const [code, setCode] = useState(cls.code || '')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function save(e) {
    e.preventDefault()
    setErr('')
    if (!name.trim()) return setErr('Nama kelas wajib diisi.')
    setBusy(true)
    try {
      if (id) {
        await q(supabase.from('classes').update({ name: name.trim(), description: desc, code }).eq('id', id))
        nav(`/kelas/${id}`)
      } else {
        const r = await q(supabase.from('classes').insert({ name: name.trim(), description: desc }).select('id').single())
        nav(`/kelas/${r.id}`)
      }
    } catch (e2) {
      setErr(e2.message.includes('duplicate') ? 'Kode kelas sudah dipakai. Buat kode lain.' : e2.message)
      setBusy(false)
    }
  }

  return (
    <>
      <Back to={id ? `/kelas/${id}` : '/kelas'}>{id ? 'Kelas' : 'Daftar kelas'}</Back>
      <h1>{id ? 'Edit kelas' : 'Buat kelas'}</h1>
      <form onSubmit={save}>
        <Field label="Nama kelas">
          <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} placeholder="Contoh: Bahasa Indonesia 8A" />
        </Field>
        <Field label="Deskripsi">
          <textarea maxLength={500} value={desc} onChange={(e) => setDesc(e.target.value)} />
        </Field>
        {id ? (
          <Field label="Kode kelas" hint="Bagikan kode ini ke siswa. Buat kode baru jika kode lama sudah tersebar.">
            <div className="row">
              <input className="grow" value={code} readOnly />
              <button type="button" className="btn alt" onClick={() => setCode(newCode())}>
                Buat kode baru
              </button>
            </div>
          </Field>
        ) : (
          <p className="small muted">Kode kelas dibuat otomatis setelah kelas disimpan.</p>
        )}
        {err && <Notice kind="err">{err}</Notice>}
        <button className="btn" disabled={busy}>
          {id ? 'Simpan perubahan' : 'Buat kelas'}
        </button>
      </form>
    </>
  )
}

const Row = ({ to, title, meta, badges }) => (
  <li>
    <Link className="item" to={to}>
      <div className="grow">
        <b>{title}</b>
        {meta && <span className="small muted">{meta}</span>}
      </div>
      {badges}
    </Link>
  </li>
)
const Draft = ({ on }) => (on ? null : <Badge tone="gray">Draf</Badge>)

export function ClassDetail() {
  const { id } = useParams()
  const nav = useNavigate()
  const { isTeacher, user } = useAuth()
  const [sp, setSp] = useSearchParams()
  const tab = sp.get('tab') || 'aliran'
  const [err, setErr] = useState('')

  const { data, error, loading, reload } = useLoad(async () => {
    const cls = await q(supabase.from('classes').select('id,name,description,code,profiles(full_name)').eq('id', id).maybeSingle())
    if (!cls) throw new Error('Kelas tidak ditemukan atau Anda tidak punya akses.')
    const [materials, assignments, exams, members, mine] = await Promise.all([
      q(supabase.from('materials').select('id,title,published,created_at').eq('class_id', id).order('created_at', { ascending: false })),
      q(supabase.from('assignments').select('id,title,published,due_at,created_at').eq('class_id', id).order('created_at', { ascending: false })),
      q(supabase.from('exams').select('id,title,published,starts_at,ends_at,created_at').eq('class_id', id).order('created_at', { ascending: false })),
      isTeacher ? q(supabase.from('class_members').select('student_id,joined_at,profiles(full_name)').eq('class_id', id).order('joined_at')) : [],
      isTeacher ? [] : q(supabase.from('submissions').select('assignment_id,exam_id,status').eq('class_id', id)),
    ])
    return { cls, materials, assignments, exams, members, mine }
  }, [id, isTeacher])

  if (loading) return <Loading />
  if (error) return (
    <>
      <Back to="/kelas">Daftar kelas</Back>
      <ErrorBox error={error} />
    </>
  )
  const { cls, materials, assignments, exams, members, mine } = data
  const tabs = [['aliran', 'Aliran'], ['materi', 'Materi'], ['tugas', 'Tugas'], ['ujian', 'Ujian'], ...(isTeacher ? [['anggota', 'Siswa']] : [])]
  const doneTask = (a) => mine.some((s) => s.assignment_id === a.id)
  const doneExam = (e) => mine.some((s) => s.exam_id === e.id && s.status !== 'in_progress')
  const feed = [
    ...materials.map((x) => ({ ...x, k: 'materi', label: 'Materi' })),
    ...assignments.map((x) => ({ ...x, k: 'tugas', label: 'Tugas' })),
    ...exams.map((x) => ({ ...x, k: 'ujian', label: 'Ujian' })),
  ]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 15)

  async function removeMember(sid) {
    if (!window.confirm('Keluarkan siswa ini dari kelas?')) return
    try {
      await q(supabase.from('class_members').delete().eq('class_id', id).eq('student_id', sid))
      reload()
    } catch (e) {
      setErr(e.message)
    }
  }
  async function leave() {
    if (!window.confirm('Keluar dari kelas ini?')) return
    try {
      await q(supabase.from('class_members').delete().eq('class_id', id).eq('student_id', user.id))
      nav('/kelas')
    } catch (e) {
      setErr(e.message)
    }
  }
  async function remove() {
    if (!window.confirm('Hapus kelas beserta seluruh materi, tugas, ujian, dan nilainya? Tindakan ini tidak bisa dibatalkan.')) return
    try {
      await q(supabase.from('classes').delete().eq('id', id))
      nav('/kelas')
    } catch (e) {
      setErr(e.message)
    }
  }

  const add = (path, label) => (
    <div className="sec" style={{ marginTop: 0 }}>
      <span />
      <Link className="btn sm" to={`/kelas/${id}/${path}/baru`}>
        + {label}
      </Link>
    </div>
  )

  return (
    <>
      <Back to="/kelas">Daftar kelas</Back>
      <div className="banner">
        <h1>{cls.name}</h1>
        {cls.description && <p className="pre">{cls.description}</p>}
        <p className="small">
          Guru: {cls.profiles?.full_name || '—'}
          {isTeacher && (
            <>
              {' '}· Kode <span className="code">{cls.code}</span>
            </>
          )}
        </p>
        {isTeacher && (
          <div className="row" style={{ marginTop: '.6rem' }}>
            <Link className="btn sm cyan" to={`/kelas/${id}/edit`}>
              Edit kelas
            </Link>
          </div>
        )}
      </div>
      {err && <Notice kind="err">{err}</Notice>}

      <div className="seg" role="tablist">
        {tabs.map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} className={tab === k ? 'on' : ''} onClick={() => setSp({ tab: k }, { replace: true })}>
            {l}
          </button>
        ))}
      </div>

      {tab === 'aliran' &&
        (feed.length ? (
          <ul className="list">
            {feed.map((x) => (
              <Row key={`${x.k}${x.id}`} to={`/kelas/${id}/${x.k}/${x.id}`} title={x.title} meta={`${x.label} baru · ${fmt(x.created_at)}`} badges={isTeacher ? <Draft on={x.published} /> : null} />
            ))}
          </ul>
        ) : (
          <Empty>{isTeacher ? 'Kelas masih kosong. Tambahkan materi, tugas, atau ujian dari tab di atas.' : 'Guru belum membagikan apa pun.'}</Empty>
        ))}

      {tab === 'materi' && (
        <>
          {isTeacher && add('materi', 'Materi')}
          {materials.length ? (
            <ul className="list">
              {materials.map((m) => (
                <Row key={m.id} to={`/kelas/${id}/materi/${m.id}`} title={m.title} meta={fmt(m.created_at)} badges={<Draft on={m.published} />} />
              ))}
            </ul>
          ) : (
            <Empty>Belum ada materi.</Empty>
          )}
        </>
      )}

      {tab === 'tugas' && (
        <>
          {isTeacher && add('tugas', 'Tugas')}
          {assignments.length ? (
            <ul className="list">
              {assignments.map((a) => (
                <Row
                  key={a.id}
                  to={`/kelas/${id}/tugas/${a.id}`}
                  title={a.title}
                  meta={a.due_at ? `Batas ${fmt(a.due_at)}` : 'Tanpa batas waktu'}
                  badges={isTeacher ? <Draft on={a.published} /> : doneTask(a) ? <Badge tone="ok">Terkumpul</Badge> : <Badge tone="warn">Belum</Badge>}
                />
              ))}
            </ul>
          ) : (
            <Empty>Belum ada tugas.</Empty>
          )}
        </>
      )}

      {tab === 'ujian' && (
        <>
          {isTeacher && add('ujian', 'Ujian')}
          {exams.length ? (
            <ul className="list">
              {exams.map((e) => (
                <Row
                  key={e.id}
                  to={`/kelas/${id}/ujian/${e.id}`}
                  title={e.title}
                  meta={e.starts_at ? `Mulai ${fmt(e.starts_at)}` : 'Tanpa jadwal mulai'}
                  badges={isTeacher ? <Draft on={e.published} /> : doneExam(e) ? <Badge tone="ok">Selesai</Badge> : null}
                />
              ))}
            </ul>
          ) : (
            <Empty>Belum ada ujian.</Empty>
          )}
        </>
      )}

      {tab === 'anggota' && isTeacher && (
        <>
          <p className="muted small">Bagikan kode <span className="code" style={{ background: 'var(--cyan-soft)', color: 'var(--navy)' }}>{cls.code}</span> agar siswa bisa bergabung.</p>
          {members.length ? (
            <ul className="list">
              {members.map((m) => (
                <li key={m.student_id} className="item">
                  <div className="grow">
                    <b>{m.profiles?.full_name || 'Siswa'}</b>
                    <span className="small muted">Bergabung {fmt(m.joined_at)}</span>
                  </div>
                  <button className="btn sm danger" onClick={() => removeMember(m.student_id)}>
                    Keluarkan
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <Empty>Belum ada siswa yang bergabung.</Empty>
          )}
        </>
      )}

      <div style={{ marginTop: '2rem' }}>
        {isTeacher ? (
          <button className="btn danger sm" onClick={remove}>
            Hapus kelas
          </button>
        ) : (
          <button className="btn danger sm" onClick={leave}>
            Keluar dari kelas
          </button>
        )}
      </div>
    </>
  )
}
