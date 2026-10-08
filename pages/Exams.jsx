import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, q, one } from '../supabase.js'
import { useAuth } from '../auth.jsx'
import { Back, Badge, Empty, ErrorBox, Field, Loading, Notice, deadlineOf, fmt, fromInput, num, pct, toInput, useLoad } from '../ui.jsx'

const TYPES = { pilihan_ganda: 'Pilihan ganda', benar_salah: 'Benar/Salah', jawaban_singkat: 'Jawaban singkat', essay: 'Essay' }
const isChoice = (t) => t === 'pilihan_ganda' || t === 'benar_salah'
const byPos = (arr) => [...(arr || [])].sort((a, b) => a.position - b.position)
const windowText = (e) =>
  e.starts_at || e.ends_at ? `${e.starts_at ? fmt(e.starts_at) : 'Sekarang'} sampai ${e.ends_at ? fmt(e.ends_at) : 'tanpa batas'}` : 'Kapan saja'
const STATUS = { in_progress: ['Mengerjakan', 'warn'], submitted: ['Menunggu penilaian', 'warn'], graded: ['Dinilai', 'ok'] }

/* ------------------------------------------------------------------ */
/* Buat / edit ujian                                                   */
/* ------------------------------------------------------------------ */
export function ExamForm() {
  const { id, eid } = useParams()
  const { data, error, loading } = useLoad(
    () => (eid ? q(supabase.from('exams').select('*').eq('id', eid).eq('class_id', id).maybeSingle()) : Promise.resolve({})),
    [eid, id]
  )
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  if (!data) return <ErrorBox error="Ujian tidak ditemukan." />
  return <ExamFormInner classId={id} exam={data} examId={eid} />
}

function ExamFormInner({ classId, exam, examId }) {
  const nav = useNavigate()
  const { profile } = useAuth()
  const subj = useLoad(() => (profile.school_id ? q(supabase.from('subjects').select('id,name').eq('school_id', profile.school_id).order('name')) : Promise.resolve([])), [profile.school_id])
  const [f, setF] = useState({
    title: exam.title || '',
    description: exam.description || '',
    duration: exam.duration_minutes ?? '',
    starts: toInput(exam.starts_at),
    ends: toInput(exam.ends_at),
    attempts: exam.max_attempts ?? 1,
    show: exam.show_score ?? false,
    published: exam.published ?? false,
    subject: exam.subject_id || '',
    shuffleQ: exam.shuffle_questions ?? false,
    shuffleO: exam.shuffle_options ?? false,
    guard: exam.anticheat ?? true,
    limit: exam.violation_limit ?? 0,
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function submit(e) {
    e.preventDefault()
    setErr('')
    const title = f.title.trim()
    if (!title) return setErr('Judul wajib diisi.')
    const dur = f.duration === '' ? null : Number(f.duration)
    if (dur !== null && (!Number.isInteger(dur) || dur < 1 || dur > 600)) return setErr('Durasi 1 sampai 600 menit, atau kosongkan.')
    const att = Number(f.attempts)
    if (!Number.isInteger(att) || att < 1 || att > 10) return setErr('Jumlah percobaan 1 sampai 10.')
    const lim = Number(f.limit)
    if (!Number.isInteger(lim) || lim < 0 || lim > 20) return setErr('Batas pelanggaran 0 sampai 20 (0 = hanya peringatan, tanpa kumpul otomatis).')
    const starts = fromInput(f.starts)
    const ends = fromInput(f.ends)
    if (starts && ends && new Date(ends) <= new Date(starts)) return setErr('Batas akhir harus setelah jadwal mulai.')
    setBusy(true)
    try {
      const payload = { title, description: f.description, duration_minutes: dur, starts_at: starts, ends_at: ends, max_attempts: att, show_score: f.show, published: f.published, subject_id: f.subject || null, shuffle_questions: f.shuffleQ, shuffle_options: f.shuffleO, anticheat: f.guard, violation_limit: lim }
      if (examId) {
        await q(supabase.from('exams').update(payload).eq('id', examId))
        nav(`/kelas/${classId}/ujian/${examId}`)
      } else {
        const r = await q(supabase.from('exams').insert({ ...payload, class_id: classId }).select('id').single())
        nav(`/kelas/${classId}/ujian/${r.id}/soal`)
      }
    } catch (e2) {
      setErr(e2.message)
      setBusy(false)
    }
  }

  async function remove() {
    if (!window.confirm('Hapus ujian beserta soal dan seluruh hasil siswa? Tidak bisa dibatalkan.')) return
    try {
      await q(supabase.from('exams').delete().eq('id', examId))
      nav(`/kelas/${classId}?tab=ujian`)
    } catch (e2) {
      setErr(e2.message)
    }
  }

  return (
    <>
      <Back to={examId ? `/kelas/${classId}/ujian/${examId}` : `/kelas/${classId}?tab=ujian`}>{examId ? 'Ujian' : 'Kelas'}</Back>
      <h1>{examId ? 'Edit ujian' : 'Ujian baru'}</h1>
      <form onSubmit={submit}>
        <Field label="Judul">
          <input required maxLength={150} value={f.title} onChange={set('title')} />
        </Field>
        <Field label="Deskripsi / petunjuk">
          <textarea maxLength={5000} value={f.description} onChange={set('description')} />
        </Field>
        {subj.data && subj.data.length > 0 && (
          <Field label="Mata pelajaran">
            <select value={f.subject} onChange={set('subject')}>
              <option value="">— tidak dipilih —</option>
              {subj.data.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Durasi (menit)" hint="Kosongkan jika tanpa batas durasi.">
          <input type="number" inputMode="numeric" min="1" max="600" value={f.duration} onChange={set('duration')} />
        </Field>
        <Field label="Jadwal mulai" hint="Kosongkan agar bisa dikerjakan sejak dipublikasikan.">
          <input type="datetime-local" value={f.starts} onChange={set('starts')} />
        </Field>
        <Field label="Batas akhir" hint="Setelah waktu ini ujian tertutup.">
          <input type="datetime-local" value={f.ends} onChange={set('ends')} />
        </Field>
        <Field label="Jumlah percobaan">
          <input type="number" inputMode="numeric" min="1" max="10" value={f.attempts} onChange={set('attempts')} />
        </Field>
        <label className="check">
          <input type="checkbox" checked={f.shuffleQ} onChange={set('shuffleQ')} />
          Acak urutan soal untuk tiap siswa
        </label>
        <label className="check">
          <input type="checkbox" checked={f.shuffleO} onChange={set('shuffleO')} />
          Acak urutan pilihan jawaban (pilihan ganda)
        </label>
        <label className="check">
          <input type="checkbox" checked={f.guard} onChange={set('guard')} />
          Aktifkan proteksi anti-curang (layar penuh, deteksi pindah tab, watermark, log)
        </label>
        {f.guard && (
          <Field label="Kumpulkan otomatis setelah ... pelanggaran" hint="0 = hanya peringatan dan dicatat (disarankan). Di HP, notifikasi atau telepon masuk bisa tercatat sebagai pelanggaran.">
            <input type="number" inputMode="numeric" min="0" max="20" value={f.limit} onChange={set('limit')} />
          </Field>
        )}
        <label className="check">
          <input type="checkbox" checked={f.show} onChange={set('show')} />
          Tampilkan nilai langsung setelah dinilai (kunci jawaban baru terbuka setelah ujian ditutup)
        </label>
        <label className="check">
          <input type="checkbox" checked={f.published} onChange={set('published')} />
          Publikasikan ke siswa (hilangkan centang untuk menyimpan sebagai draf)
        </label>
        {err && <Notice kind="err">{err}</Notice>}
        <div className="row">
          <button className="btn" disabled={busy}>
            {examId ? 'Simpan' : 'Simpan dan buat soal'}
          </button>
          {examId && (
            <button type="button" className="btn danger" onClick={remove}>
              Hapus ujian
            </button>
          )}
        </div>
      </form>
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Detail ujian (guru & siswa)                                         */
/* ------------------------------------------------------------------ */
export function ExamDetail() {
  const { id, eid } = useParams()
  const { isTeacher } = useAuth()
  const [err, setErr] = useState('')
  const { data, error, loading, reload } = useLoad(async () => {
    const exam = await q(supabase.from('exams').select('*').eq('id', eid).eq('class_id', id).maybeSingle())
    if (!exam) throw new Error('Ujian tidak ditemukan.')
    const qs = isTeacher ? await q(supabase.from('questions').select('id,points').eq('exam_id', eid)) : []
    const subs = isTeacher
      ? []
      : await q(supabase.from('submissions').select('id,attempt_no,status,submitted_at,grades!grades_submission_id_fkey(score,max_score,released)').eq('exam_id', eid).order('attempt_no'))
    return { exam, qs, subs }
  }, [eid, id, isTeacher])

  if (loading) return <Loading />
  if (error)
    return (
      <>
        <Back to={`/kelas/${id}?tab=ujian`}>Kelas</Back>
        <ErrorBox error={error} />
      </>
    )
  const { exam, qs, subs } = data
  const now = Date.now()
  const notYet = exam.starts_at && new Date(exam.starts_at).getTime() > now
  const ended = exam.ends_at && new Date(exam.ends_at).getTime() < now
  const inProg = subs.find((s) => s.status === 'in_progress')
  const canStart = !notYet && !ended && (inProg || subs.length < exam.max_attempts)

  async function togglePublish() {
    setErr('')
    if (!exam.published && !qs.length) return setErr('Tambahkan minimal satu soal sebelum mempublikasikan.')
    try {
      await q(supabase.from('exams').update({ published: !exam.published }).eq('id', eid))
      reload()
    } catch (e) {
      setErr(e.message)
    }
  }

  return (
    <>
      <Back to={`/kelas/${id}?tab=ujian`}>Kelas</Back>
      <h1>{exam.title}</h1>
      <p className="small muted">
        {!exam.published && <Badge tone="gray">Draf</Badge>} {exam.duration_minutes ? `${exam.duration_minutes} menit` : 'Tanpa batas durasi'} ·{' '}
        {exam.max_attempts} percobaan
      </p>
      {exam.description && <div className="pre" style={{ margin: '.8rem 0' }}>{exam.description}</div>}
      <p className="small">Jadwal: {windowText(exam)}</p>
      {err && <Notice kind="err">{err}</Notice>}

      {isTeacher ? (
        <>
          <p className="small">
            {qs.length} soal · total bobot {num(qs.reduce((n, x) => n + Number(x.points), 0))} · nilai {exam.show_score ? 'langsung tampil' : 'ditampilkan guru'}
          </p>
          <div className="row" style={{ marginTop: '.8rem' }}>
            <Link className="btn" to={`/kelas/${id}/ujian/${eid}/soal`}>
              Kelola soal
            </Link>
            <Link className="btn alt" to={`/kelas/${id}/ujian/${eid}/hasil`}>
              Hasil siswa
            </Link>
          </div>
          <div className="row" style={{ marginTop: '.6rem' }}>
            <button className="btn alt sm" onClick={togglePublish}>
              {exam.published ? 'Jadikan draf' : 'Publikasikan'}
            </button>
            <Link className="btn alt sm" to={`/kelas/${id}/ujian/${eid}/edit`}>
              Edit pengaturan
            </Link>
            <Link className="btn alt sm" to={`/kelas/${id}/ujian/${eid}/log`}>
              Log & pelanggaran
            </Link>
          </div>
        </>
      ) : (
        <>
          <div className="sec">
            <h2>Pengerjaan Anda</h2>
            <span className="small muted">
              {subs.length}/{exam.max_attempts} percobaan
            </span>
          </div>
          {subs.length ? (
            <ul className="list">
              {subs.map((s) => {
                const g = one(s.grades)
                const [label, tone] = STATUS[s.status]
                return (
                  <li key={s.id} className="item">
                    <div className="grow">
                      <b>Percobaan {s.attempt_no}</b>
                      <span className="small muted">{s.submitted_at ? fmt(s.submitted_at) : 'Belum dikumpulkan'}</span>
                    </div>
                    {g ? <Badge tone="ok">{num(g.score)}/{num(g.max_score)}</Badge> : <Badge tone={tone}>{label}</Badge>}
                  </li>
                )
              })}
            </ul>
          ) : (
            <Empty>Belum pernah dikerjakan.</Empty>
          )}
          {notYet && <Notice>Ujian dibuka {fmt(exam.starts_at)}.</Notice>}
          {ended && !inProg && <Notice>Ujian sudah ditutup.</Notice>}
          <div className="row">
            {canStart && (
              <Link className="btn" to={`/kelas/${id}/ujian/${eid}/kerjakan`}>
                {inProg ? 'Lanjutkan ujian' : 'Mulai ujian'}
              </Link>
            )}
            {subs.length > 0 && (
              <Link className="btn alt" to={`/kelas/${id}/ujian/${eid}/hasil`}>
                Riwayat & hasil
              </Link>
            )}
          </div>
          {canStart && exam.duration_minutes && !inProg && (
            <p className="small muted">Waktu {exam.duration_minutes} menit berjalan sejak Anda menekan Mulai dan tidak berhenti walau halaman ditutup.</p>
          )}
        </>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Buat soal                                                           */
/* ------------------------------------------------------------------ */
export function ExamQuestions() {
  const { id, eid } = useParams()
  const [editing, setEditing] = useState(null) // null | 'new' | objek soal
  const [err, setErr] = useState('')
  const { data, error, loading, reload } = useLoad(async () => {
    const exam = await q(supabase.from('exams').select('id,title,published').eq('id', eid).eq('class_id', id).maybeSingle())
    if (!exam) throw new Error('Ujian tidak ditemukan.')
    const qs = await q(
      supabase
        .from('questions')
        .select('id,type,body,points,position,choices!choices_question_id_fkey(id,label,position),answer_keys!answer_keys_question_id_fkey(correct_choice_id,accepted_answers)')
        .eq('exam_id', eid)
        .order('position')
    )
    const { count } = await supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('exam_id', eid)
    return { exam, qs, hasSubs: (count || 0) > 0 }
  }, [eid, id])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const { exam, qs, hasSubs } = data

  async function move(i, d) {
    const a = qs[i]
    const b = qs[i + d]
    if (!b) return
    try {
      await Promise.all([
        q(supabase.from('questions').update({ position: b.position }).eq('id', a.id)),
        q(supabase.from('questions').update({ position: a.position }).eq('id', b.id)),
      ])
      reload()
    } catch (e) {
      setErr(e.message)
    }
  }
  async function remove(qu) {
    if (!window.confirm('Hapus soal ini?')) return
    try {
      await q(supabase.from('questions').delete().eq('id', qu.id))
      reload()
    } catch (e) {
      setErr(e.message)
    }
  }
  const nextPos = qs.length ? Math.max(...qs.map((x) => x.position)) + 1 : 0
  const done = () => {
    setEditing(null)
    reload()
  }

  return (
    <>
      <Back to={`/kelas/${id}/ujian/${eid}`}>{exam.title}</Back>
      <div className="between">
        <h1>Soal</h1>
        {!editing && (
          <button className="btn" onClick={() => setEditing('new')}>
            + Tambah soal
          </button>
        )}
      </div>
      {!exam.published && <p className="small muted">Ujian masih draf. Soal belum terlihat oleh siswa.</p>}
      {err && <Notice kind="err">{err}</Notice>}

      {editing && (
        <QuestionEditor
          key={editing === 'new' ? 'new' : editing.id}
          examId={eid}
          question={editing === 'new' ? null : editing}
          nextPos={nextPos}
          hasSubs={hasSubs}
          onDone={done}
          onCancel={() => setEditing(null)}
        />
      )}

      {qs.length ? (
        <ul className="list">
          {qs.map((qu, i) => (
            <li key={qu.id} className="item col">
              <div className="between">
                <span>
                  <Badge>{TYPES[qu.type]}</Badge> <span className="small muted">{num(qu.points)} poin</span>
                </span>
                <span className="small muted">No. {i + 1}</span>
              </div>
              <div className="pre">{qu.body.length > 200 ? `${qu.body.slice(0, 200)}…` : qu.body}</div>
              <div className="row">
                <button className="btn sm alt" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Naikkan">
                  ↑
                </button>
                <button className="btn sm alt" disabled={i === qs.length - 1} onClick={() => move(i, 1)} aria-label="Turunkan">
                  ↓
                </button>
                <button className="btn sm alt" onClick={() => setEditing(qu)}>
                  Edit
                </button>
                <button className="btn sm danger" onClick={() => remove(qu)}>
                  Hapus
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        !editing && <Empty>Belum ada soal. Tekan Tambah soal untuk memulai.</Empty>
      )}
    </>
  )
}

function QuestionEditor({ examId, question, nextPos, hasSubs, onDone, onCancel }) {
  const key = one(question?.answer_keys)
  const oldChoices = byPos(question?.choices)
  const [type, setType] = useState(question?.type || 'pilihan_ganda')
  const [body, setBody] = useState(question?.body || '')
  const [points, setPoints] = useState(question?.points ?? 1)
  const [choices, setChoices] = useState(question?.type === 'pilihan_ganda' && oldChoices.length ? oldChoices.map((c) => c.label) : ['', '', '', ''])
  const [correct, setCorrect] = useState(Math.max(0, oldChoices.findIndex((c) => c.id === key?.correct_choice_id)))
  const [short, setShort] = useState((key?.accepted_answers || []).join('\n'))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  function removeChoice(i) {
    setChoices(choices.filter((_, j) => j !== i))
    if (correct === i) setCorrect(0)
    else if (correct > i) setCorrect(correct - 1)
  }

  async function save() {
    setErr('')
    if (!body.trim()) return setErr('Teks soal wajib diisi.')
    const pts = Number(points)
    if (Number.isNaN(pts) || pts < 0 || pts > 1000) return setErr('Bobot harus antara 0 dan 1000.')
    let labels = []
    let correctPos = 0
    let accepted = []
    if (type === 'pilihan_ganda') {
      const entries = choices.map((label, i) => ({ label: label.trim(), i })).filter((x) => x.label)
      if (entries.length < 2) return setErr('Isi minimal dua pilihan jawaban.')
      correctPos = entries.findIndex((x) => x.i === correct)
      if (correctPos < 0) return setErr('Pilih jawaban yang benar (tidak boleh kosong).')
      labels = entries.map((x) => x.label)
    } else if (type === 'benar_salah') {
      labels = ['Benar', 'Salah']
      correctPos = correct === 1 ? 1 : 0
    } else if (type === 'jawaban_singkat') {
      accepted = short.split('\n').map((s) => s.trim()).filter(Boolean).slice(0, 20)
      if (!accepted.length) return setErr('Isi minimal satu jawaban yang dianggap benar.')
    }
    setBusy(true)
    try {
      let qid = question?.id
      const base = { type, body: body.trim(), points: pts }
      if (qid) await q(supabase.from('questions').update(base).eq('id', qid))
      else qid = (await q(supabase.from('questions').insert({ ...base, exam_id: examId, position: nextPos }).select('id').single())).id

      await q(supabase.from('choices').delete().eq('question_id', qid))
      let correctId = null
      if (labels.length) {
        const rows = await q(supabase.from('choices').insert(labels.map((label, i) => ({ question_id: qid, label, position: i }))).select('id,position'))
        correctId = rows.find((r) => r.position === correctPos)?.id ?? null
      }
      if (type === 'essay') await q(supabase.from('answer_keys').delete().eq('question_id', qid))
      else await q(supabase.from('answer_keys').upsert({ question_id: qid, correct_choice_id: correctId, accepted_answers: accepted }, { onConflict: 'question_id' }))
      onDone()
    } catch (e) {
      setErr(e.message)
      setBusy(false)
    }
  }

  return (
    <div className="item col" style={{ border: '1px solid var(--cyan)', borderRadius: 10, background: '#fff', marginBottom: '1rem' }}>
      <h2>{question ? 'Edit soal' : 'Soal baru'}</h2>
      {hasSubs && <Notice kind="err">Sudah ada siswa yang mengerjakan ujian ini. Mengubah soal atau pilihan dapat memengaruhi jawaban dan nilai yang sudah ada.</Notice>}
      <Field label="Jenis soal">
        <select value={type} onChange={(e) => setType(e.target.value)}>
          {Object.entries(TYPES).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Teks soal">
        <textarea maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
      </Field>
      <Field label="Bobot (poin)">
        <input type="number" inputMode="decimal" min="0" max="1000" step="any" value={points} onChange={(e) => setPoints(e.target.value)} />
      </Field>

      {type === 'pilihan_ganda' && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend className="small" style={{ fontWeight: 600 }}>
            Pilihan jawaban (tandai yang benar)
          </legend>
          {choices.map((c, i) => (
            <div className="row" key={i} style={{ margin: '.4rem 0', flexWrap: 'nowrap' }}>
              <input type="radio" name="correct" checked={correct === i} onChange={() => setCorrect(i)} aria-label={`Jawaban benar: pilihan ${i + 1}`} />
              <input className="grow" maxLength={500} placeholder={`Pilihan ${String.fromCharCode(65 + i)}`} value={c} onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))} />
              {choices.length > 2 && (
                <button type="button" className="btn sm danger" onClick={() => removeChoice(i)} aria-label="Hapus pilihan">
                  ×
                </button>
              )}
            </div>
          ))}
          <button type="button" className="btn sm alt" disabled={choices.length >= 6} onClick={() => setChoices([...choices, ''])}>
            + Pilihan
          </button>
        </fieldset>
      )}

      {type === 'benar_salah' && (
        <div className="seg2" role="group" aria-label="Jawaban yang benar">
          {['Benar', 'Salah'].map((l, i) => (
            <button type="button" key={l} className={(correct === 1 ? 1 : 0) === i ? 'on' : ''} onClick={() => setCorrect(i)}>
              Jawaban: {l}
            </button>
          ))}
        </div>
      )}

      {type === 'jawaban_singkat' && (
        <Field label="Jawaban yang dianggap benar" hint="Satu jawaban per baris. Huruf besar/kecil dan spasi di tepi diabaikan.">
          <textarea style={{ minHeight: 80 }} value={short} onChange={(e) => setShort(e.target.value)} />
        </Field>
      )}
      {type === 'essay' && <p className="small muted">Essay dinilai manual oleh guru dari halaman hasil.</p>}

      {err && <Notice kind="err">{err}</Notice>}
      <div className="row">
        <button className="btn" disabled={busy} onClick={save}>
          Simpan soal
        </button>
        <button className="btn alt" disabled={busy} onClick={onCancel}>
          Batal
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Hasil ujian (guru: semua siswa, siswa: riwayat sendiri)             */
/* ------------------------------------------------------------------ */
export function ExamResult() {
  const { id, eid } = useParams()
  const { isTeacher } = useAuth()
  const [msg, setMsg] = useState('')
  const { data, error, loading, reload } = useLoad(async () => {
    const exam = await q(supabase.from('exams').select('id,title,duration_minutes,ends_at,show_score').eq('id', eid).eq('class_id', id).maybeSingle())
    if (!exam) throw new Error('Ujian tidak ditemukan.')
    const fetchSubs = () =>
      q(
        supabase
          .from('submissions')
          .select('id,attempt_no,status,started_at,submitted_at,profiles!submissions_student_id_fkey(full_name),grades!grades_submission_id_fkey(score,max_score,released)')
          .eq('exam_id', eid)
          .order('attempt_no')
      )
    let subs = await fetchSubs()
    if (!isTeacher) {
      // Pengerjaan yang waktunya habis tapi belum dikumpulkan → kumpulkan otomatis.
      const stale = subs.filter((s) => s.status === 'in_progress' && deadlineOf(exam, s.started_at) !== null && Date.now() > deadlineOf(exam, s.started_at) + 35000)
      if (stale.length) {
        await Promise.all(stale.map((s) => supabase.rpc('submit_exam', { p_submission: s.id })))
        subs = await fetchSubs()
      }
    }
    return { exam, subs }
  }, [eid, id, isTeacher])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const { exam, subs } = data
  const rpc = async (name, args) => {
    setMsg('')
    const { error: e } = await supabase.rpc(name, args)
    if (e) setMsg(e.message)
    else reload()
  }

  const graded = subs.filter((s) => one(s.grades))
  const avg = graded.length ? Math.round(graded.reduce((n, s) => n + pct(one(s.grades).score, one(s.grades).max_score), 0) / graded.length) : null

  return (
    <>
      <Back to={`/kelas/${id}/ujian/${eid}`}>{exam.title}</Back>
      <h1>{isTeacher ? 'Hasil siswa' : 'Riwayat pengerjaan'}</h1>
      {msg && <Notice kind="err">{msg}</Notice>}

      {isTeacher && (
        <>
          <p className="small muted">
            {subs.length} pengerjaan {avg !== null && `· rata-rata ${avg}`}
          </p>
          <div className="row">
            <button className="btn sm alt" onClick={() => rpc('release_exam_grades', { p_exam: eid, p_release: true })}>
              Tampilkan semua nilai
            </button>
            <button className="btn sm alt" onClick={() => rpc('release_exam_grades', { p_exam: eid, p_release: false })}>
              Sembunyikan semua nilai
            </button>
          </div>
        </>
      )}

      {subs.length ? (
        <ul className="list">
          {subs.map((s) => {
            const g = one(s.grades)
            const [label, tone] = STATUS[s.status]
            return (
              <li key={s.id} className="item">
                <div className="grow">
                  <b>{isTeacher ? s.profiles?.full_name || 'Siswa' : `Percobaan ${s.attempt_no}`}</b>
                  <span className="small muted">
                    {isTeacher && `Percobaan ${s.attempt_no} · `}
                    {s.submitted_at ? fmt(s.submitted_at) : 'Belum dikumpulkan'}
                  </span>
                </div>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  {g ? (
                    <Badge tone="ok">
                      {num(g.score)}/{num(g.max_score)}
                    </Badge>
                  ) : (
                    <Badge tone={isTeacher ? tone : 'gray'}>{isTeacher || s.status === 'in_progress' ? label : 'Nilai belum ditampilkan'}</Badge>
                  )}
                  {isTeacher && s.status === 'in_progress' ? (
                    <button className="btn sm alt" onClick={() => rpc('submit_exam', { p_submission: s.id })}>
                      Akhiri
                    </button>
                  ) : (
                    (isTeacher || g) && (
                      <Link className="btn sm alt" to={`/kelas/${id}/ujian/${eid}/hasil/${s.id}`}>
                        {isTeacher ? 'Periksa' : 'Jawaban'}
                      </Link>
                    )
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty>{isTeacher ? 'Belum ada siswa yang mengerjakan.' : 'Belum ada pengerjaan.'}</Empty>
      )}
    </>
  )
}

/* ------------------------------------------------------------------ */
/* Periksa satu pengerjaan                                             */
/* ------------------------------------------------------------------ */
function AnswerGrade({ ans, max, reload }) {
  const [score, setScore] = useState(ans.score ?? '')
  const [fb, setFb] = useState(ans.feedback ?? '')
  const [msg, setMsg] = useState(null)
  async function save() {
    const v = Number(score)
    if (score === '' || Number.isNaN(v) || v < 0 || v > max) return setMsg({ kind: 'err', text: `Nilai harus 0 sampai ${num(max)}.` })
    const { error } = await supabase.rpc('grade_answer', { p_answer: ans.id, p_score: v, p_feedback: fb })
    if (error) return setMsg({ kind: 'err', text: error.message })
    setMsg({ kind: 'ok', text: 'Tersimpan.' })
    reload()
  }
  return (
    <>
      <div className="row">
        <input style={{ width: 90 }} type="number" inputMode="decimal" min="0" max={max} step="any" placeholder="Nilai" aria-label="Nilai soal" value={score} onChange={(e) => setScore(e.target.value)} />
        <input className="grow" placeholder="Komentar (opsional)" aria-label="Komentar" maxLength={2000} value={fb} onChange={(e) => setFb(e.target.value)} />
        <button className="btn sm" onClick={save}>
          Simpan
        </button>
      </div>
      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
    </>
  )
}

export function SubmissionReview() {
  const { id, eid, sid } = useParams()
  const { isTeacher } = useAuth()
  const [msg, setMsg] = useState('')
  const { data, error, loading, reload } = useLoad(async () => {
    const sub = await q(
      supabase
        .from('submissions')
        .select('id,attempt_no,status,submitted_at,profiles!submissions_student_id_fkey(full_name),grades!grades_submission_id_fkey(score,max_score,released)')
        .eq('id', sid)
        .eq('exam_id', eid)
        .maybeSingle()
    )
    if (!sub) throw new Error('Pengerjaan tidak ditemukan.')
    const [qs, ans] = await Promise.all([
      q(
        supabase
          .from('questions')
          .select('id,type,body,points,position,choices!choices_question_id_fkey(id,label,position),answer_keys!answer_keys_question_id_fkey(correct_choice_id,accepted_answers)')
          .eq('exam_id', eid)
          .order('position')
      ),
      q(supabase.from('answers').select('id,question_id,choice_id,answer_text,score,feedback').eq('submission_id', sid)),
    ])
    return { sub, qs, ans }
  }, [sid, eid])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const { sub, qs, ans } = data
  const g = one(sub.grades)

  async function release(v) {
    const { error: e } = await supabase.rpc('release_grade', { p_submission: sid, p_release: v })
    if (e) setMsg(e.message)
    else reload()
  }

  return (
    <>
      <Back to={`/kelas/${id}/ujian/${eid}/hasil`}>Hasil</Back>
      <h1>{isTeacher ? sub.profiles?.full_name || 'Siswa' : `Percobaan ${sub.attempt_no}`}</h1>
      <p className="small muted">
        Percobaan {sub.attempt_no} · {sub.submitted_at ? fmt(sub.submitted_at) : 'belum dikumpulkan'}
      </p>
      {g && (
        <p>
          Nilai: <b>{num(g.score)}</b> / {num(g.max_score)} {isTeacher && <Badge tone={g.released ? 'ok' : 'gray'}>{g.released ? 'Tampil ke siswa' : 'Disembunyikan'}</Badge>}
        </p>
      )}
      {msg && <Notice kind="err">{msg}</Notice>}
      {isTeacher && g && (
        <button className="btn sm alt" onClick={() => release(!g.released)}>
          {g.released ? 'Sembunyikan nilai' : 'Tampilkan nilai ke siswa'}
        </button>
      )}
      {!isTeacher && !ans.length && <Notice>Nilai dan jawaban belum ditampilkan oleh guru.</Notice>}

      {(isTeacher || ans.length > 0) && (
        <ul className="list" style={{ marginTop: '1rem' }}>
          {qs.map((qu, i) => {
            const a = ans.find((x) => x.question_id === qu.id)
            const k = one(qu.answer_keys)
            const cs = byPos(qu.choices)
            const picked = cs.find((c) => c.id === a?.choice_id)
            const right = k ? cs.find((c) => c.id === k.correct_choice_id) : null
            const none = <i className="muted">tidak dijawab</i>
            return (
              <li key={qu.id} className="item col">
                <div className="between">
                  <span className="small muted">
                    No. {i + 1} · {TYPES[qu.type]}
                  </span>
                  <Badge tone={a && a.score !== null ? (Number(a.score) >= Number(qu.points) ? 'ok' : Number(a.score) > 0 ? 'warn' : 'err') : 'gray'}>
                    {a && a.score !== null ? `${num(a.score)}/${num(qu.points)}` : `—/${num(qu.points)}`}
                  </Badge>
                </div>
                <div className="pre">{qu.body}</div>
                <div className="pre">Jawaban: {isChoice(qu.type) ? picked?.label || none : a?.answer_text || none}</div>
                {isChoice(qu.type) && right && <div className="small ok-text">Kunci: {right.label}</div>}
                {qu.type === 'jawaban_singkat' && k?.accepted_answers?.length > 0 && <div className="small ok-text">Kunci: {k.accepted_answers.join(' / ')}</div>}
                {a?.feedback && <div className="small pre">Komentar guru: {a.feedback}</div>}
                {isTeacher && a && <AnswerGrade key={`${a.id}-${a.score}`} ans={a} max={qu.points} reload={reload} />}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
