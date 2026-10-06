import { Link } from 'react-router-dom'
import { supabase, q } from '../supabase.js'
import { useAuth } from '../auth.jsx'
import { Badge, Empty, ErrorBox, Loading, fmt, num, pct, useLoad } from '../ui.jsx'

const now = () => new Date()
const taskActive = (a) => a.published && (!a.due_at || new Date(a.due_at) > now())
const examOpen = (e) => e.published && (!e.ends_at || new Date(e.ends_at) > now())

async function teacherData() {
  const classes = await q(
    supabase.from('classes').select('id,name,code,class_members(count)').order('created_at', { ascending: false })
  )
  const ids = classes.map((c) => c.id)
  if (!ids.length) return { classes, assignments: [], exams: [], grades: [], recent: [] }
  const [assignments, exams, grades, recent] = await Promise.all([
    q(supabase.from('assignments').select('id,class_id,title,due_at,published').in('class_id', ids)),
    q(supabase.from('exams').select('id,class_id,title,ends_at,published').in('class_id', ids)),
    q(supabase.from('grades').select('score,max_score,class_id').in('class_id', ids).limit(1000)),
    q(
      supabase
        .from('submissions')
        .select('id,class_id,exam_id,assignment_id,submitted_at,profiles!submissions_student_id_fkey(full_name),exams(title),assignments(title)')
        .in('class_id', ids)
        .neq('status', 'in_progress')
        .order('submitted_at', { ascending: false })
        .limit(8)
    ),
  ])
  return { classes, assignments, exams, grades, recent }
}

async function studentData() {
  const classes = await q(supabase.from('classes').select('id,name,profiles!classes_teacher_id_fkey(full_name)').order('created_at', { ascending: false }))
  const ids = classes.map((c) => c.id)
  if (!ids.length) return { classes, assignments: [], exams: [], subs: [], grades: [], feed: [] }
  const [assignments, exams, materials, subs, grades] = await Promise.all([
    q(supabase.from('assignments').select('id,class_id,title,due_at,created_at').in('class_id', ids)),
    q(supabase.from('exams').select('id,class_id,title,starts_at,ends_at,created_at').in('class_id', ids)),
    q(supabase.from('materials').select('id,class_id,title,created_at').in('class_id', ids).order('created_at', { ascending: false }).limit(8)),
    q(supabase.from('submissions').select('id,assignment_id,exam_id,status')),
    q(
      supabase
        .from('grades')
        .select('id,score,max_score,graded_at,class_id,submissions!grades_submission_id_fkey(exam_id,assignment_id,exams(title),assignments(title))')
        .order('graded_at', { ascending: false })
        .limit(5)
    ),
  ])
  const feed = [
    ...materials.map((x) => ({ ...x, k: 'materi', label: 'Materi' })),
    ...assignments.map((x) => ({ ...x, k: 'tugas', label: 'Tugas' })),
    ...exams.map((x) => ({ ...x, k: 'ujian', label: 'Ujian' })),
  ]
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    .slice(0, 8)
  return { classes, assignments, exams, subs, grades, feed }
}

const Stat = ({ n, label }) => (
  <div className="stat">
    <b>{n}</b>
    <span>{label}</span>
  </div>
)
const Sec = ({ title, to, children }) => (
  <>
    <div className="sec">
      <h2>{title}</h2>
      {to && (
        <Link className="small" to={to}>
          Lihat semua
        </Link>
      )}
    </div>
    {children}
  </>
)

function Teacher({ d }) {
  const students = d.classes.reduce((n, c) => n + (c.class_members?.[0]?.count || 0), 0)
  const byClass = d.classes.map((c) => {
    const g = d.grades.filter((x) => x.class_id === c.id)
    const avg = g.length ? Math.round(g.reduce((s, x) => s + pct(x.score, x.max_score), 0) / g.length) : null
    return { c, n: g.length, avg }
  })
  return (
    <>
      <div className="stats">
        <Stat n={d.classes.length} label="Kelas" />
        <Stat n={students} label="Siswa" />
        <Stat n={d.assignments.filter(taskActive).length} label="Tugas aktif" />
        <Stat n={d.exams.filter(examOpen).length} label="Ujian aktif" />
      </div>

      <Sec title="Kelas saya" to="/kelas">
        {d.classes.length ? (
          <ul className="list">
            {d.classes.slice(0, 5).map((c) => (
              <li key={c.id}>
                <Link className="item" to={`/kelas/${c.id}`}>
                  <div className="grow">
                    <b>{c.name}</b>
                    <span className="small muted">{c.class_members?.[0]?.count || 0} siswa</span>
                  </div>
                  <span className="code" style={{ background: 'var(--cyan-soft)', color: 'var(--navy)' }}>
                    {c.code}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>
            Belum ada kelas. <Link to="/kelas/baru">Buat kelas pertama</Link> lalu bagikan kodenya ke siswa.
          </Empty>
        )}
      </Sec>

      <Sec title="Aktivitas terbaru">
        {d.recent.length ? (
          <ul className="list">
            {d.recent.map((s) => (
              <li key={s.id}>
                <Link
                  className="item"
                  to={s.exam_id ? `/kelas/${s.class_id}/ujian/${s.exam_id}/hasil/${s.id}` : `/kelas/${s.class_id}/tugas/${s.assignment_id}`}
                >
                  <div className="grow">
                    <b>{s.profiles?.full_name || 'Siswa'}</b>
                    <span className="small muted">
                      {s.exam_id ? 'mengumpulkan ujian' : 'mengumpulkan tugas'} {s.exams?.title || s.assignments?.title}
                    </span>
                  </div>
                  <span className="small muted">{fmt(s.submitted_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Belum ada pengumpulan dari siswa.</Empty>
        )}
      </Sec>

      <Sec title="Ringkasan nilai">
        {byClass.some((x) => x.n) ? (
          <ul className="list">
            {byClass
              .filter((x) => x.n)
              .map(({ c, n, avg }) => (
                <li key={c.id} className="item">
                  <div className="grow">
                    <b>{c.name}</b>
                    <span className="small muted">{n} nilai</span>
                  </div>
                  <Badge tone={avg >= 75 ? 'ok' : 'warn'}>Rata-rata {avg}</Badge>
                </li>
              ))}
          </ul>
        ) : (
          <Empty>Nilai akan muncul setelah siswa mengumpulkan ujian atau tugas yang sudah dinilai.</Empty>
        )}
      </Sec>
    </>
  )
}

function Student({ d }) {
  const pending = d.assignments
    .filter((a) => !d.subs.some((s) => s.assignment_id === a.id))
    .sort((a, b) => (a.due_at ? new Date(a.due_at) : Infinity) - (b.due_at ? new Date(b.due_at) : Infinity))
  const upcoming = d.exams
    .filter((e) => (!e.ends_at || new Date(e.ends_at) > now()) && !d.subs.some((s) => s.exam_id === e.id && s.status !== 'in_progress'))
    .sort((a, b) => (a.starts_at ? new Date(a.starts_at) : 0) - (b.starts_at ? new Date(b.starts_at) : 0))
  const clsName = (id) => d.classes.find((c) => c.id === id)?.name
  if (!d.classes.length)
    return (
      <Empty>
        Anda belum bergabung ke kelas. <Link to="/kelas">Masukkan kode kelas</Link> dari guru Anda.
      </Empty>
    )
  return (
    <>
      <Sec title="Kelas saya" to="/kelas">
        <ul className="list">
          {d.classes.slice(0, 5).map((c) => (
            <li key={c.id}>
              <Link className="item" to={`/kelas/${c.id}`}>
                <div className="grow">
                  <b>{c.name}</b>
                  <span className="small muted">Guru: {c.profiles?.full_name || '—'}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </Sec>

      <Sec title="Tugas yang belum selesai">
        {pending.length ? (
          <ul className="list">
            {pending.slice(0, 6).map((a) => (
              <li key={a.id}>
                <Link className="item" to={`/kelas/${a.class_id}/tugas/${a.id}`}>
                  <div className="grow">
                    <b>{a.title}</b>
                    <span className="small muted">{clsName(a.class_id)}</span>
                  </div>
                  {a.due_at && <Badge tone={new Date(a.due_at) < now() ? 'err' : 'warn'}>{fmt(a.due_at)}</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Semua tugas sudah dikumpulkan.</Empty>
        )}
      </Sec>

      <Sec title="Ujian yang akan datang">
        {upcoming.length ? (
          <ul className="list">
            {upcoming.slice(0, 5).map((e) => (
              <li key={e.id}>
                <Link className="item" to={`/kelas/${e.class_id}/ujian/${e.id}`}>
                  <div className="grow">
                    <b>{e.title}</b>
                    <span className="small muted">{clsName(e.class_id)}</span>
                  </div>
                  <span className="small muted">{e.starts_at && new Date(e.starts_at) > now() ? `Mulai ${fmt(e.starts_at)}` : 'Sudah dibuka'}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Tidak ada ujian yang menunggu.</Empty>
        )}
      </Sec>

      <Sec title="Aktivitas terbaru">
        {d.feed.length ? (
          <ul className="list">
            {d.feed.map((x) => (
              <li key={`${x.k}${x.id}`}>
                <Link className="item" to={`/kelas/${x.class_id}/${x.k}/${x.id}`}>
                  <div className="grow">
                    <b>{x.title}</b>
                    <span className="small muted">
                      {x.label} baru · {clsName(x.class_id)}
                    </span>
                  </div>
                  <span className="small muted">{fmt(x.created_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Belum ada aktivitas di kelas Anda.</Empty>
        )}
      </Sec>

      <Sec title="Nilai terbaru">
        {d.grades.length ? (
          <ul className="list">
            {d.grades.map((g) => (
              <li key={g.id} className="item">
                <div className="grow">
                  <b>{g.submissions?.exams?.title || g.submissions?.assignments?.title || 'Penilaian'}</b>
                  <span className="small muted">{clsName(g.class_id)}</span>
                </div>
                <Badge tone={pct(g.score, g.max_score) >= 75 ? 'ok' : 'warn'}>
                  {num(g.score)}/{num(g.max_score)}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>Belum ada nilai yang ditampilkan.</Empty>
        )}
      </Sec>
    </>
  )
}

export function Dashboard() {
  const { profile, isTeacher } = useAuth()
  const { data, error, loading } = useLoad(() => (isTeacher ? teacherData() : studentData()), [isTeacher])
  const first = profile.full_name.trim().split(' ')[0]
  return (
    <>
      <h1>Halo{first ? `, ${first}` : ''}</h1>
      {loading ? <Loading /> : error ? <ErrorBox error={error} /> : isTeacher ? <Teacher d={data} /> : <Student d={data} />}
    </>
  )
}
