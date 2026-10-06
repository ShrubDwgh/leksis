import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, q, one } from '../supabase.js'
import { useAuth } from '../auth.jsx'
import { Back, Badge, Empty, ErrorBox, Field, Loading, Notice, fmt, fromInput, num, safeUrl, toInput, useLoad } from '../ui.jsx'

// Satu formulir untuk Materi ("materials") dan Tugas ("assignments").
export function ItemForm({ kind }) {
  const { id, mid, aid } = useParams()
  const itemId = kind === 'materi' ? mid : aid
  const table = kind === 'materi' ? 'materials' : 'assignments'
  const { data, error, loading } = useLoad(
    () => (itemId ? q(supabase.from(table).select('*').eq('id', itemId).eq('class_id', id).maybeSingle()) : Promise.resolve({})),
    [itemId, table]
  )
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return <ErrorBox error="Data tidak ditemukan." />
  return <ItemFormInner kind={kind} table={table} classId={id} itemId={itemId} item={data} />
}

function ItemFormInner({ kind, table, classId, itemId, item }) {
  const nav = useNavigate()
  const task = kind === 'tugas'
  const [f, setF] = useState({
    title: item.title || '',
    content: item.content || '',
    link: item.link_url || '',
    due: toInput(item.due_at),
    max: item.max_score ?? 100,
    published: item.published ?? true,
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const label = task ? 'tugas' : 'materi'

  async function save(e) {
    e.preventDefault()
    setErr('')
    if (!f.title.trim()) return setErr('Judul wajib diisi.')
    if (f.link.trim() && !safeUrl(f.link.trim())) return setErr('Tautan harus diawali http:// atau https://')
    const max = Number(f.max)
    if (task && (!(max > 0) || max > 1000)) return setErr('Nilai maksimal harus antara 1 dan 1000.')
    const payload = { title: f.title.trim(), content: f.content, link_url: f.link.trim() || null, published: f.published }
    if (task) Object.assign(payload, { due_at: fromInput(f.due), max_score: max })
    setBusy(true)
    try {
      if (itemId) await q(supabase.from(table).update(payload).eq('id', itemId))
      else await q(supabase.from(table).insert({ ...payload, class_id: classId }))
      nav(`/kelas/${classId}?tab=${kind}`)
    } catch (e2) {
      setErr(e2.message)
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm(`Hapus ${label} ini?`)) return
    try {
      await q(supabase.from(table).delete().eq('id', itemId))
      nav(`/kelas/${classId}?tab=${kind}`)
    } catch (e2) {
      setErr(e2.message)
    }
  }

  return (
    <>
      <Back to={`/kelas/${classId}?tab=${kind}`}>Kelas</Back>
      <h1>{itemId ? `Edit ${label}` : `${task ? 'Tugas' : 'Materi'} baru`}</h1>
      <form onSubmit={save}>
        <Field label="Judul">
          <input required maxLength={150} value={f.title} onChange={set('title')} />
        </Field>
        <Field label={task ? 'Petunjuk tugas' : 'Isi materi'}>
          <textarea style={{ minHeight: 180 }} maxLength={20000} value={f.content} onChange={set('content')} />
        </Field>
        <Field label="Tautan (opsional)" hint="Contoh: video, dokumen, atau situs rujukan.">
          <input type="url" inputMode="url" maxLength={500} value={f.link} onChange={set('link')} placeholder="https://" />
        </Field>
        {task && (
          <>
            <Field label="Batas pengumpulan (opsional)">
              <input type="datetime-local" value={f.due} onChange={set('due')} />
            </Field>
            <Field label="Nilai maksimal">
              <input type="number" inputMode="decimal" min="1" max="1000" step="any" value={f.max} onChange={set('max')} />
            </Field>
          </>
        )}
        <label className="check">
          <input type="checkbox" checked={f.published} onChange={set('published')} />
          Tampilkan ke siswa (hilangkan centang untuk menyimpan sebagai draf)
        </label>
        {err && <Notice kind="err">{err}</Notice>}
        <div className="row">
          <button className="btn" disabled={busy}>
            Simpan
          </button>
          {itemId && (
            <button type="button" className="btn danger" onClick={remove}>
              Hapus
            </button>
          )}
        </div>
      </form>
    </>
  )
}

export function MaterialView() {
  const { id, mid } = useParams()
  const { isTeacher } = useAuth()
  const { data, error, loading } = useLoad(() => q(supabase.from('materials').select('*').eq('id', mid).eq('class_id', id).maybeSingle()), [mid, id])
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return <ErrorBox error="Materi tidak ditemukan." />
  const url = safeUrl(data.link_url)
  return (
    <>
      <Back to={`/kelas/${id}?tab=materi`}>Kelas</Back>
      <h1>{data.title}</h1>
      <p className="small muted">
        Diposting {fmt(data.created_at)} {!data.published && <Badge tone="gray">Draf</Badge>}
      </p>
      {data.content && <div className="pre" style={{ margin: '1rem 0' }}>{data.content}</div>}
      {url && (
        <p>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Buka tautan materi ↗
          </a>
        </p>
      )}
      {isTeacher && (
        <Link className="btn alt" to={`/kelas/${id}/materi/${mid}/edit`}>
          Edit materi
        </Link>
      )}
    </>
  )
}

function GradeRow({ s, max, reload }) {
  const g = one(s.grades)
  const [score, setScore] = useState(g?.score ?? '')
  const [fb, setFb] = useState(g?.feedback ?? '')
  const [msg, setMsg] = useState(null)
  const url = safeUrl(s.link_url)

  async function save() {
    const v = Number(score)
    if (score === '' || Number.isNaN(v) || v < 0 || v > max) return setMsg({ kind: 'err', text: `Nilai harus 0 sampai ${num(max)}.` })
    const { error } = await supabase.rpc('grade_submission', { p_submission: s.id, p_score: v, p_feedback: fb, p_release: true })
    if (error) return setMsg({ kind: 'err', text: error.message })
    setMsg({ kind: 'ok', text: 'Nilai tersimpan dan ditampilkan ke siswa.' })
    reload()
  }

  return (
    <li className="item col">
      <div className="between">
        <b>{s.profiles?.full_name || 'Siswa'}</b>
        <span className="small muted">{fmt(s.submitted_at)}</span>
      </div>
      {s.content && <div className="pre">{s.content}</div>}
      {url && (
        <a href={url} target="_blank" rel="noopener noreferrer">
          Buka tautan jawaban ↗
        </a>
      )}
      <div className="row">
        <input style={{ width: 90 }} type="number" inputMode="decimal" min="0" max={max} step="any" placeholder="Nilai" aria-label="Nilai" value={score} onChange={(e) => setScore(e.target.value)} />
        <input className="grow" placeholder="Komentar (opsional)" aria-label="Komentar" maxLength={2000} value={fb} onChange={(e) => setFb(e.target.value)} />
        <button className="btn sm" onClick={save}>
          Simpan
        </button>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </li>
  )
}

export function AssignmentView() {
  const { id, aid } = useParams()
  const { isTeacher } = useAuth()
  const { data, error, loading, reload } = useLoad(async () => {
    const a = await q(supabase.from('assignments').select('*').eq('id', aid).eq('class_id', id).maybeSingle())
    if (!a) throw new Error('Tugas tidak ditemukan.')
    const subs = await q(
      supabase
        .from('submissions')
        .select('id,student_id,content,link_url,submitted_at,status,profiles!submissions_student_id_fkey(full_name),grades!grades_submission_id_fkey(score,max_score,feedback,released)')
        .eq('assignment_id', aid)
        .order('submitted_at', { ascending: false })
    )
    const members = isTeacher ? await q(supabase.from('class_members').select('student_id,profiles!class_members_student_id_fkey(full_name)').eq('class_id', id)) : []
    return { a, subs, members }
  }, [aid, id, isTeacher])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const { a, subs, members } = data
  const late = a.due_at && new Date(a.due_at) < new Date()
  const url = safeUrl(a.link_url)

  return (
    <>
      <Back to={`/kelas/${id}?tab=tugas`}>Kelas</Back>
      <h1>{a.title}</h1>
      <p className="small muted">
        {a.due_at ? `Batas ${fmt(a.due_at)}` : 'Tanpa batas waktu'} · Nilai maks. {num(a.max_score)}{' '}
        {!a.published && <Badge tone="gray">Draf</Badge>}
      </p>
      {a.content && <div className="pre" style={{ margin: '1rem 0' }}>{a.content}</div>}
      {url && (
        <p>
          <a href={url} target="_blank" rel="noopener noreferrer">
            Buka tautan ↗
          </a>
        </p>
      )}

      {isTeacher ? (
        <>
          <Link className="btn alt sm" to={`/kelas/${id}/tugas/${aid}/edit`}>
            Edit tugas
          </Link>
          <div className="sec">
            <h2>Pengumpulan ({subs.length}/{members.length})</h2>
          </div>
          {subs.length ? (
            <ul className="list">
              {subs.map((s) => (
                <GradeRow key={s.id} s={s} max={a.max_score} reload={reload} />
              ))}
            </ul>
          ) : (
            <Empty>Belum ada siswa yang mengumpulkan.</Empty>
          )}
          {members.length > subs.length && (
            <p className="small muted">
              Belum mengumpulkan:{' '}
              {members
                .filter((m) => !subs.some((s) => s.student_id === m.student_id))
                .map((m) => m.profiles?.full_name || 'Siswa')
                .join(', ')}
            </p>
          )}
        </>
      ) : (
        <StudentSubmit a={a} mine={subs[0]} late={late} reload={reload} />
      )}
    </>
  )
}

function StudentSubmit({ a, mine, late, reload }) {
  const g = one(mine?.grades)
  const locked = mine?.status === 'graded'
  const [content, setContent] = useState(mine?.content || '')
  const [link, setLink] = useState(mine?.link_url || '')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  async function submit(e) {
    e.preventDefault()
    if (link.trim() && !safeUrl(link.trim())) return setMsg({ kind: 'err', text: 'Tautan harus diawali http:// atau https://' })
    setBusy(true)
    const { error } = await supabase.rpc('submit_assignment', { p_assignment: a.id, p_content: content, p_link: link })
    setBusy(false)
    if (error) return setMsg({ kind: 'err', text: error.message })
    setMsg({ kind: 'ok', text: 'Jawaban terkirim.' })
    reload()
  }

  return (
    <>
      <div className="sec">
        <h2>Jawaban Anda</h2>
        {mine ? <Badge tone="ok">Terkumpul {fmt(mine.submitted_at)}</Badge> : <Badge tone="warn">Belum dikumpulkan</Badge>}
      </div>
      {late && !mine && <Notice kind="err">Batas waktu sudah lewat. Jawaban tetap bisa dikirim dan akan ditandai terlambat oleh waktu kirimnya.</Notice>}
      {g && (
        <Notice kind="ok">
          Nilai: <b>{num(g.score)}</b> / {num(g.max_score)}
          {g.feedback && <div className="pre">Komentar guru: {g.feedback}</div>}
        </Notice>
      )}
      {locked ? (
        <p className="muted small">Tugas sudah dinilai, jawaban tidak dapat diubah.</p>
      ) : (
        <form onSubmit={submit}>
          <Field label="Jawaban">
            <textarea style={{ minHeight: 160 }} maxLength={20000} value={content} onChange={(e) => setContent(e.target.value)} />
          </Field>
          <Field label="Tautan jawaban (opsional)">
            <input type="url" inputMode="url" maxLength={500} placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />
          </Field>
          {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
          <button className="btn" disabled={busy}>
            {mine ? 'Perbarui jawaban' : 'Kirim jawaban'}
          </button>
        </form>
      )}
    </>
  )
}
