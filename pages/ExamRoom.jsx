import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, q } from '../supabase.js'
import { useAuth } from '../auth.jsx'
import { ExamGuard } from '../guard.jsx'
import { Back, Badge, Empty, ErrorBox, Loading, Modal, Notice, fmt, num, useLoad } from '../ui.jsx'

const WARN = {
  left_page: 'Anda meninggalkan halaman ujian.',
  fullscreen_exit: 'Anda keluar dari layar penuh.',
  screenshot_key: 'Terdeteksi tombol tangkapan layar.',
  resize_shrink: 'Ukuran jendela ujian berubah.',
  devtools_open: 'Terdeteksi alat pengembang browser terbuka.',
  pip_open: 'Terdeteksi jendela melayang (PiP).',
}
const hasAnswer = (a) => Boolean(a && (a.choice_id || (a.answer_text || '').trim()))
// ID perangkat acak (bukan data pribadi) agar server bisa membedakan "refresh di perangkat yang sama" vs "dibuka di perangkat lain".
const deviceId = () => {
  try {
    let d = localStorage.getItem('leksis_device')
    if (!d) {
      d = crypto.randomUUID()
      localStorage.setItem('leksis_device', d)
    }
    return d
  } catch {
    return 'nodevice'
  }
}

export function ExamTake() {
  const { id, eid } = useParams()
  const nav = useNavigate()
  const { profile } = useAuth()
  const info = useLoad(async () => {
    const exam = await q(
      supabase.from('exams').select('id,title,description,duration_minutes,anticheat,violation_limit,max_attempts').eq('id', eid).eq('class_id', id).maybeSingle()
    )
    if (!exam) throw new Error('Ujian tidak ditemukan.')
    return exam
  }, [eid, id])

  const [phase, setPhase] = useState('intro') // intro | running | blocked
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [blockMsg, setBlockMsg] = useState('')
  const [qs, setQs] = useState([])
  const [answers, setAnswers] = useState({})
  const [cur, setCur] = useState(0)
  const [save, setSave] = useState('saved') // saved | saving | error
  const [left, setLeft] = useState(null)
  const [warn, setWarn] = useState(null)
  const [confirm, setConfirm] = useState(null) // 'submit' | 'exit'
  const [stamp, setStamp] = useState(() => new Date().toLocaleString('id-ID'))
  const tok = useRef(null)
  const sid = useRef(null)
  const answersRef = useRef({})
  const dirty = useRef(new Set())
  const timers = useRef({})
  const endAt = useRef(null)
  const submitting = useRef(false)
  const result = `/kelas/${id}/ujian/${eid}/hasil`

  function resync(remaining) {
    if (remaining !== null && remaining !== undefined) endAt.current = Date.now() + remaining * 1000
  }

  function fail(e) {
    const m = (e && e.message) || String(e)
    if (m.includes('SESSION_REPLACED')) {
      Object.values(timers.current).forEach(clearTimeout)
      setBlockMsg('Ujian ini dibuka di perangkat atau tab lain, jadi sesi di sini dihentikan. Jawaban yang sudah tersimpan tetap aman. Buka ujian lagi dari halaman ujian bila ingin melanjutkan di sini.')
      setPhase('blocked')
    } else if (m.includes('WAKTU_HABIS')) doSubmit(true)
    else if (m.includes('SUDAH_DIKUMPULKAN')) nav(result, { replace: true })
    else {
      setSave('error')
      setErr(m)
    }
  }

  async function start() {
    setBusy(true)
    setErr('')
    try {
      // Layar penuh hanya boleh diminta dari klik pengguna, jadi dipanggil paling awal di sini.
      if (info.data.anticheat && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen().catch(() => {})
      const s = await q(supabase.rpc('start_exam', { p_exam: eid, p_device: deviceId() }))
      if (s.error) throw new Error(s.error)
      tok.current = s.token
      sid.current = s.submission_id
      const d = await q(supabase.rpc('get_exam_questions', { p_submission: s.submission_id, p_token: s.token }))
      if (!d.questions.length) throw new Error('Ujian ini belum memiliki soal.')
      answersRef.current = d.answers || {}
      setAnswers(answersRef.current)
      setQs(d.questions)
      resync(d.remaining)
      setLeft(d.remaining == null ? null : d.remaining * 1000)
      setCur(0)
      setPhase('running')
    } catch (e) {
      if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {})
      setErr(e.message)
    }
    setBusy(false)
  }

  async function persist(qid) {
    const a = answersRef.current[qid] || {}
    setSave('saving')
    const { data, error } = await supabase.rpc('save_answer', {
      p_submission: sid.current,
      p_token: tok.current,
      p_question: qid,
      p_choice: a.choice_id ?? null,
      p_text: a.answer_text ?? null,
    })
    if (error) {
      fail(error)
      return false
    }
    resync(data && data.remaining)
    if (answersRef.current[qid] === a) dirty.current.delete(qid)
    setSave(dirty.current.size ? 'saving' : 'saved')
    return true
  }

  async function flush() {
    Object.values(timers.current).forEach(clearTimeout)
    let ok = true
    for (const qid of [...dirty.current]) ok = (await persist(qid)) && ok
    return ok
  }

  // Pilihan disimpan langsung; teks (jawaban singkat/essay) disimpan 2 detik setelah berhenti mengetik.
  function change(qid, patch, now) {
    answersRef.current = { ...answersRef.current, [qid]: { ...answersRef.current[qid], ...patch } }
    setAnswers(answersRef.current)
    dirty.current.add(qid)
    clearTimeout(timers.current[qid])
    if (now) persist(qid)
    else timers.current[qid] = setTimeout(() => persist(qid), 2000)
  }

  function goto(i) {
    flush()
    setCur(i)
  }

  async function doSubmit(auto = false) {
    if (submitting.current) return
    submitting.current = true
    setConfirm(null)
    setErr('')
    const ok = await flush()
    if (!ok && !auto) {
      submitting.current = false
      setErr('Sebagian jawaban belum tersimpan. Periksa koneksi lalu coba lagi.')
      return
    }
    const { error } = await supabase.rpc('submit_exam', { p_submission: sid.current })
    if (error) {
      submitting.current = false
      setErr(error.message)
      return
    }
    nav(result, { replace: true })
  }

  async function onViolation(type, details) {
    const { data, error } = await supabase.rpc('log_event', { p_submission: sid.current, p_token: tok.current, p_type: type, p_details: details || {} })
    if (error) return fail(error)
    if (data.auto_submitted) return nav(result, { replace: true })
    if (WARN[type]) setWarn({ type, count: data.violations, limit: data.limit })
  }

  // Timer tampilan (batas sebenarnya dijaga server), detak jantung 15 dtk, cap waktu watermark
  useEffect(() => {
    if (phase !== 'running') return undefined
    const t = setInterval(() => {
      if (endAt.current === null) return
      const ms = endAt.current - Date.now()
      setLeft(Math.max(0, ms))
      if (ms <= 0) doSubmit(true)
    }, 1000)
    const ping = setInterval(async () => {
      const { data, error } = await supabase.rpc('exam_ping', { p_submission: sid.current, p_token: tok.current })
      if (error) fail(error)
      else resync(data && data.remaining)
    }, 15000)
    const st = setInterval(() => setStamp(new Date().toLocaleString('id-ID')), 60000)
    return () => {
      clearInterval(t)
      clearInterval(ping)
      clearInterval(st)
    }
  }, [phase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (save !== 'error' || phase !== 'running') return undefined
    const t = setTimeout(flush, 5000)
    return () => clearTimeout(t)
  }, [save, phase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => Object.values(timers.current).forEach(clearTimeout), [])

  if (info.loading) return <Loading />
  if (info.error)
    return (
      <>
        <Back to={`/kelas/${id}/ujian/${eid}`}>Ujian</Back>
        <ErrorBox error={info.error} />
      </>
    )
  const exam = info.data

  if (phase === 'blocked')
    return (
      <>
        <h1>Sesi dihentikan</h1>
        <Notice kind="err">{blockMsg}</Notice>
        <Link className="btn" to={`/kelas/${id}/ujian/${eid}`}>
          Ke halaman ujian
        </Link>
      </>
    )

  if (phase === 'intro')
    return (
      <>
        <Back to={`/kelas/${id}/ujian/${eid}`}>Ujian</Back>
        <h1>{exam.title}</h1>
        {exam.description && <div className="pre" style={{ margin: '.8rem 0' }}>{exam.description}</div>}
        <p className="small muted">{exam.duration_minutes ? `Durasi ${exam.duration_minutes} menit. Waktu dihitung server dan tidak berhenti walau halaman ditutup.` : 'Tanpa batas durasi.'}</p>
        <div className="note">
          <b>Sebelum mulai</b>
          <ul style={{ margin: '.4rem 0 0', paddingLeft: '1.1rem' }}>
            <li>Jawaban tersimpan otomatis. Jika halaman ter-refresh, tekan Lanjutkan.</li>
            <li>Kerjakan di satu perangkat dan satu tab. Membuka ujian di tempat lain menghentikan sesi yang lama dan dicatat.</li>
            {exam.anticheat && (
              <>
                <li>Ujian ini dikerjakan dalam layar penuh bila browser mendukung. Jangan pindah tab/aplikasi atau membagi layar.</li>
                <li>Salin, tempel, dan klik kanan dinonaktifkan. Aktivitas mencurigakan dicatat dan ditinjau guru.</li>
                {exam.violation_limit > 0 && <li>Setelah {exam.violation_limit} pelanggaran, ujian dikumpulkan otomatis.</li>}
                <li>Tangkapan layar di HP tidak bisa dideteksi aplikasi. Aturan sekolah tetap berlaku.</li>
              </>
            )}
          </ul>
        </div>
        {err && <Notice kind="err">{err}</Notice>}
        <button className="btn" onClick={start} disabled={busy}>
          {busy ? 'Menyiapkan…' : 'Mulai / lanjutkan ujian'}
        </button>
      </>
    )

  const qu = qs[cur]
  const a = answers[qu.id] || {}
  const answered = qs.filter((x) => hasAnswer(answers[x.id])).length
  const mm = left === null ? null : `${String(Math.floor(left / 60000)).padStart(2, '0')}:${String(Math.floor((left % 60000) / 1000)).padStart(2, '0')}`

  const body = (
    <>
      <div className="examtop">
        <div className="between">
          <b>{exam.title}</b>
          {mm && <span className={`timer ${left < 60000 ? 'err-text' : ''}`}>{mm}</span>}
        </div>
        <div className="bar" aria-hidden="true">
          <i style={{ width: `${(answered / qs.length) * 100}%` }} />
        </div>
        <div className="between small muted">
          <span>
            {answered} dari {qs.length} terjawab
          </span>
          <span>{save === 'saved' ? 'Tersimpan' : save === 'saving' ? 'Menyimpan…' : 'Gagal menyimpan, mencoba lagi…'}</span>
        </div>
      </div>

      <div style={{ marginTop: '.6rem' }}>
        <p className="small muted">
          Soal {cur + 1} dari {qs.length} · {num(qu.points)} poin
        </p>
        <div className="pre noselect" style={{ fontSize: '1.05rem', margin: '.4rem 0 .8rem' }}>
          {qu.body}
        </div>
        {(qu.type === 'pilihan_ganda' || qu.type === 'benar_salah') &&
          qu.choices.map((c) => (
            <label key={c.id} className={`opt noselect ${a.choice_id === c.id ? 'on' : ''}`}>
              <input type="radio" name={`q${qu.id}`} checked={a.choice_id === c.id} onChange={() => change(qu.id, { choice_id: c.id, answer_text: null }, true)} />
              <span>{c.label}</span>
            </label>
          ))}
        {qu.type === 'jawaban_singkat' && (
          <input
            maxLength={500}
            placeholder="Tulis jawaban singkat"
            aria-label="Jawaban"
            value={a.answer_text || ''}
            onChange={(e) => change(qu.id, { answer_text: e.target.value, choice_id: null })}
            onBlur={() => dirty.current.has(qu.id) && persist(qu.id)}
          />
        )}
        {qu.type === 'essay' && (
          <textarea
            data-allow-paste="true"
            style={{ minHeight: 180 }}
            maxLength={10000}
            placeholder="Tulis jawaban Anda"
            aria-label="Jawaban"
            value={a.answer_text || ''}
            onChange={(e) => change(qu.id, { answer_text: e.target.value, choice_id: null })}
            onBlur={() => dirty.current.has(qu.id) && persist(qu.id)}
          />
        )}
      </div>

      <div className="between" style={{ marginTop: '1rem' }}>
        <button className="btn alt" disabled={cur === 0} onClick={() => goto(cur - 1)}>
          Sebelumnya
        </button>
        {cur < qs.length - 1 ? (
          <button className="btn" onClick={() => goto(cur + 1)}>
            Berikutnya
          </button>
        ) : (
          <button className="btn cyan" onClick={() => setConfirm('submit')}>
            Kumpulkan
          </button>
        )}
      </div>

      <div className="qnav" role="navigation" aria-label="Nomor soal">
        {qs.map((x, i) => (
          <button key={x.id} className={i === cur ? 'cur' : hasAnswer(answers[x.id]) ? 'done' : ''} onClick={() => goto(i)} aria-label={`Soal ${i + 1}${hasAnswer(answers[x.id]) ? ', sudah dijawab' : ''}`}>
            {i + 1}
          </button>
        ))}
      </div>
      {err && <Notice kind="err">{err}</Notice>}
      <button className="btn cyan" style={{ width: '100%' }} onClick={() => setConfirm('submit')}>
        Kumpulkan jawaban
      </button>

      {confirm === 'submit' && (
        <Modal
          title="Kumpulkan jawaban?"
          actions={
            <>
              <button className="btn alt" onClick={() => setConfirm(null)}>
                Batal
              </button>
              <button className="btn" onClick={() => doSubmit(false)}>
                Kumpulkan
              </button>
            </>
          }
        >
          <p>{qs.length - answered > 0 ? `Masih ada ${qs.length - answered} soal yang belum dijawab. ` : ''}Setelah dikumpulkan, jawaban tidak bisa diubah.</p>
        </Modal>
      )}
      {confirm === 'exit' && (
        <Modal
          title="Keluar dari ujian?"
          actions={
            <>
              <button className="btn alt" onClick={() => setConfirm(null)}>
                Tetap mengerjakan
              </button>
              <button className="btn danger" onClick={() => doSubmit(false)}>
                Keluar dan kumpulkan
              </button>
            </>
          }
        >
          <p>Jika keluar, ujian akan dikumpulkan sekarang dengan jawaban yang sudah ada.</p>
        </Modal>
      )}
      {warn && (
        <Modal
          title="Peringatan"
          actions={
            <button className="btn" onClick={() => setWarn(null)}>
              Mengerti
            </button>
          }
        >
          <p>{WARN[warn.type]}</p>
          <p className="small muted">
            {warn.limit > 0
              ? `Pelanggaran ke-${warn.count} dari ${warn.limit}. Setelah batas tercapai, ujian dikumpulkan otomatis.`
              : 'Aktivitas ini dicatat dan dapat ditinjau oleh guru.'}
          </p>
        </Modal>
      )}
    </>
  )

  return exam.anticheat ? (
    <ExamGuard active needFullscreen watermark={`${profile.full_name} - ${profile.nis || '-'} - ${stamp}`} onViolation={onViolation} onExitAttempt={() => setConfirm('exit')}>
      {body}
    </ExamGuard>
  ) : (
    body
  )
}

/* ------------------------------------------------------------------ */
/* Guru: log aktivitas & skor risiko                                   */
/* ------------------------------------------------------------------ */
const LABEL = {
  start_exam: 'Mulai ujian', resume: 'Melanjutkan sesi', answer_question: 'Menjawab soal',
  left_page: 'Meninggalkan halaman', blur_short: 'Sempat keluar halaman (singkat)', fullscreen_exit: 'Keluar layar penuh',
  screenshot_key: 'Tombol tangkapan layar', resize_shrink: 'Jendela menyusut', devtools_open: 'DevTools terdeteksi',
  pip_open: 'Jendela melayang (PiP)', copy_attempt: 'Coba menyalin', paste_attempt: 'Coba menempel', contextmenu: 'Klik kanan',
  back_attempt: 'Menekan tombol kembali', shortcut_blocked: 'Pintasan diblokir', multiple_device: 'Dibuka di perangkat/tab lain',
  device_change: 'User-agent berubah', ip_change: 'Alamat IP berubah', auto_submit: 'Dikumpulkan otomatis',
  submit_click: 'Menekan kumpulkan', other: 'Lainnya',
}
export const risk = (score) => (score >= 6 ? ['Tinggi', 'err'] : score >= 3 ? ['Sedang', 'warn'] : ['Rendah', 'ok'])

function Timeline({ sid }) {
  const { data, error, loading } = useLoad(async () => {
    const [act, vio] = await Promise.all([
      q(supabase.from('exam_activity_log').select('activity_type,details,created_at').eq('submission_id', sid).order('created_at').limit(600)),
      q(supabase.from('exam_violations').select('violation_type,severity,details,created_at').eq('submission_id', sid).order('created_at').limit(300)),
    ])
    const sev = Object.fromEntries(vio.map((v) => [`${v.violation_type}`, v.severity]))
    const rows = [
      ...act.map((r) => ({ t: r.created_at, type: r.activity_type, d: r.details, sev: vio.some((v) => v.violation_type === r.activity_type && v.created_at === r.created_at) ? sev[r.activity_type] : 0 })),
      ...vio.filter((v) => ['multiple_device', 'device_change'].includes(v.violation_type)).map((v) => ({ t: v.created_at, type: v.violation_type, d: v.details, sev: v.severity })),
    ].sort((a, b) => new Date(a.t) - new Date(b.t))
    return rows
  }, [sid])
  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const rows = data.filter((r) => r.type !== 'answer_question')
  const answers = data.length - rows.length
  return (
    <>
      <p className="small muted">{answers} kali menyimpan jawaban (tidak ditampilkan).</p>
      <table className="tbl">
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{new Date(r.t).toLocaleTimeString('id-ID')}</td>
              <td>
                {r.sev > 0 ? <b className="err-text">! </b> : null}
                {LABEL[r.type] || r.type}
                {r.d && r.d.seconds !== undefined ? <span className="muted"> ({r.d.seconds} dtk)</span> : null}
                {r.type === 'ip_change' && r.d ? <span className="muted"> ({r.d.old} → {r.d.new})</span> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  )
}

export function ExamLog() {
  const { id, eid } = useParams()
  const [open, setOpen] = useState(null)
  const { data, error, loading } = useLoad(async () => {
    const exam = await q(supabase.from('exams').select('id,title,anticheat,violation_limit').eq('id', eid).eq('class_id', id).maybeSingle())
    if (!exam) throw new Error('Ujian tidak ditemukan.')
    const subs = await q(
      supabase
        .from('submissions')
        .select('id,attempt_no,status,violation_count,ip_address,user_agent,started_at,submitted_at,profiles!submissions_student_id_fkey(full_name,nis)')
        .eq('exam_id', eid)
        .order('started_at')
    )
    const ids = subs.map((s) => s.id)
    const viol = ids.length ? await q(supabase.from('exam_violations').select('submission_id,severity').in('submission_id', ids).limit(5000)) : []
    return { exam, subs, viol }
  }, [eid, id])

  if (loading) return <Loading />
  if (error) return <ErrorBox error={error} />
  const { exam, subs, viol } = data
  const score = (sid) => viol.filter((v) => v.submission_id === sid).reduce((n, v) => n + v.severity, 0)

  return (
    <>
      <Back to={`/kelas/${id}/ujian/${eid}`}>{exam.title}</Back>
      <h1>Log & pelanggaran</h1>
      <p className="small muted">
        Skor risiko = jumlah bobot pelanggaran (Rendah &lt;3, Sedang 3–5, Tinggi ≥6). Ini indikator untuk ditinjau, bukan bukti kecurangan: koneksi, notifikasi, atau perangkat siswa bisa memicu catatan. Keputusan ada pada guru.
      </p>
      {!exam.anticheat && <Notice>Proteksi anti-curang dimatikan untuk ujian ini, jadi hanya aktivitas dasar yang tercatat.</Notice>}
      {subs.length ? (
        <ul className="list">
          {subs.map((s) => {
            const sc = score(s.id)
            const [label, tone] = risk(sc)
            return (
              <li key={s.id} className="item col">
                <div className="between">
                  <div>
                    <b>{s.profiles?.full_name || 'Siswa'}</b>
                    <span className="small muted">
                      {s.profiles?.nis ? `NIS ${s.profiles.nis} · ` : ''}percobaan {s.attempt_no} · {s.status === 'in_progress' ? 'sedang mengerjakan' : fmt(s.submitted_at)}
                    </span>
                  </div>
                  <Badge tone={tone}>Risiko {label}</Badge>
                </div>
                <div className="small muted">
                  {s.violation_count} pelanggaran tercatat · skor {sc}
                </div>
                <button className="btn sm alt" onClick={() => setOpen(open === s.id ? null : s.id)}>
                  {open === s.id ? 'Tutup timeline' : 'Lihat timeline'}
                </button>
                {open === s.id && (
                  <>
                    <p className="small muted pre">IP awal: {s.ip_address || '—'} · {s.user_agent || '—'}</p>
                    <Timeline sid={s.id} />
                  </>
                )}
              </li>
            )
          })}
        </ul>
      ) : (
        <Empty>Belum ada siswa yang mengerjakan.</Empty>
      )}
    </>
  )
}
