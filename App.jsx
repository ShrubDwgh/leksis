import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import { configured } from './supabase.js'
import { Loading, Logo } from './ui.jsx'
import { Forgot, Landing, Login, Register, Reset } from './pages/Auth.jsx'
import { Dashboard } from './pages/Dashboard.jsx'
import { ClassDetail, ClassForm, ClassList } from './pages/Classes.jsx'
import { AssignmentView, ItemForm, MaterialView } from './pages/Content.jsx'
import { ExamDetail, ExamForm, ExamQuestions, ExamResult, ExamTake, SubmissionReview } from './pages/Exams.jsx'
import { NotFound, Profile, Settings, Unauthorized } from './pages/Account.jsx'

function Protected({ roles }) {
  const { session, profile, loading, signOut } = useAuth()
  const loc = useLocation()
  if (loading) return <Loading full />
  if (!session) return <Navigate to="/login" replace state={{ from: loc }} />
  if (!profile)
    return (
      <div className="full">
        <div>
          <p>Profil akun tidak ditemukan. Pastikan supabase.sql sudah dijalankan, lalu masuk ulang.</p>
          <button className="btn" onClick={signOut}>
            Keluar
          </button>
        </div>
      </div>
    )
  if (roles && !roles.includes(profile.role)) return <Navigate to="/unauthorized" replace />
  return <Outlet />
}

const icons = {
  home: <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  kelas: <path d="M3 5h7a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H3zM21 5h-7a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h7z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
}
const Tab = ({ to, icon, children }) => (
  <NavLink to={to} className={({ isActive }) => (isActive ? 'active' : '')}>
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {icons[icon]}
    </svg>
    {children}
  </NavLink>
)

function Layout() {
  const { profile } = useAuth()
  return (
    <>
      <header className="top">
        <Link to="/dashboard" className="brand">
          <Logo /> Leksis
        </Link>
        <nav className="tabs" aria-label="Navigasi utama">
          <Tab to="/dashboard" icon="home">
            Beranda
          </Tab>
          <Tab to="/kelas" icon="kelas">
            Kelas
          </Tab>
          <Tab to="/profil" icon="user">
            Profil
          </Tab>
        </nav>
        <span className="who">{profile.full_name}</span>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  )
}

export default function App() {
  if (!configured)
    return (
      <div className="full">
        <div>
          <h1>Leksis belum dikonfigurasi</h1>
          <p className="muted">
            Isi VITE_SUPABASE_URL dan VITE_SUPABASE_PUBLISHABLE_KEY di Vercel → Settings → Environment Variables, lalu
            Redeploy.
          </p>
        </div>
      </div>
    )
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<Forgot />} />
      <Route path="/reset-password" element={<Reset />} />

      <Route element={<Protected />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/kelas" element={<ClassList />} />
          <Route path="/kelas/:id" element={<ClassDetail />} />
          <Route path="/kelas/:id/materi/:mid" element={<MaterialView />} />
          <Route path="/kelas/:id/tugas/:aid" element={<AssignmentView />} />
          <Route path="/kelas/:id/ujian/:eid" element={<ExamDetail />} />
          <Route path="/kelas/:id/ujian/:eid/hasil" element={<ExamResult />} />
          <Route path="/kelas/:id/ujian/:eid/hasil/:sid" element={<SubmissionReview />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/pengaturan" element={<Settings />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          <Route element={<Protected roles={['guru']} />}>
            <Route path="/kelas/baru" element={<ClassForm />} />
            <Route path="/kelas/:id/edit" element={<ClassForm />} />
            <Route path="/kelas/:id/materi/baru" element={<ItemForm kind="materi" />} />
            <Route path="/kelas/:id/materi/:mid/edit" element={<ItemForm kind="materi" />} />
            <Route path="/kelas/:id/tugas/baru" element={<ItemForm kind="tugas" />} />
            <Route path="/kelas/:id/tugas/:aid/edit" element={<ItemForm kind="tugas" />} />
            <Route path="/kelas/:id/ujian/baru" element={<ExamForm />} />
            <Route path="/kelas/:id/ujian/:eid/edit" element={<ExamForm />} />
            <Route path="/kelas/:id/ujian/:eid/soal" element={<ExamQuestions />} />
          </Route>
          <Route element={<Protected roles={['siswa']} />}>
            <Route path="/kelas/:id/ujian/:eid/kerjakan" element={<ExamTake />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
