import { Link, NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './auth.jsx'
import { configured } from './supabase.js'
import { useTheme, safeImg } from './theme.jsx'
import { Loading, Logo } from './ui.jsx'
import { Forgot, Landing, Login, Register, Reset } from './pages/Auth.jsx'
import { Dashboard } from './pages/Dashboard.jsx'
import { ClassDetail, ClassForm, ClassList } from './pages/Classes.jsx'
import { AssignmentView, ItemForm, MaterialView } from './pages/Content.jsx'
import { ExamDetail, ExamForm, ExamQuestions, ExamResult, SubmissionReview } from './pages/Exams.jsx'
import { ExamLog, ExamTake } from './pages/ExamRoom.jsx'
import { NotFound, Profile, Settings, Unauthorized } from './pages/Account.jsx'
import { AdminHome, AdminSubjects, AdminUsers, AdminYears, PlatformAdmin } from './pages/School.jsx'
import { BrandFooter, BrandingSettings, SchoolLogin } from './pages/Branding.jsx'
import { Attendance, ParentChild, ParentHome, Schedule } from './pages/Academic.jsx'

const MEMBERS = ['teacher', 'school_admin', 'student']
const STAFF = ['teacher', 'school_admin']

function Protected({ roles }) {
  const { session, profile, loading, signOut, profileError, refresh } = useAuth()
  const loc = useLocation()
  if (loading) return <Loading full />
  if (!session) return <Navigate to="/login" replace state={{ from: loc }} />
  if (!profile)
    return (
      <div className="full">
        <div>
          <p>{profileError ? 'Profil akun gagal dimuat.' : 'Profil akun tidak ditemukan di database.'}</p>
          {profileError && <p className="note err">Penyebab: {profileError}</p>}
          <p className="small muted">Jika baru menjalankan SQL, jalankan juga: notify pgrst, 'reload schema'; di SQL Editor. Panduan lengkap ada di README bagian "Profil akun tidak ditemukan".</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn alt" onClick={refresh}>
              Coba lagi
            </button>
            <button className="btn" onClick={signOut}>
              Keluar
            </button>
          </div>
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
  cal: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  check: (
    <>
      <rect x="6" y="4" width="12" height="17" rx="2" />
      <path d="M9 4h6v3H9zM9 14l2 2 4-4" />
    </>
  ),
  school: <path d="M3 10l9-6 9 6M5 10v9h14v-9M9 19v-5h6v5" />,
}

// Menu navigasi mengikuti peran (bawah di HP, sidebar di layar lebar)
const MENUS = {
  student: [['/dashboard', 'home', 'Beranda'], ['/kelas', 'kelas', 'Kelas'], ['/jadwal', 'cal', 'Jadwal'], ['/absensi', 'check', 'Absensi'], ['/profil', 'user', 'Profil']],
  teacher: [['/dashboard', 'home', 'Beranda'], ['/kelas', 'kelas', 'Kelas'], ['/jadwal', 'cal', 'Jadwal'], ['/absensi', 'check', 'Absensi'], ['/profil', 'user', 'Profil']],
  school_admin: [['/dashboard', 'home', 'Beranda'], ['/kelas', 'kelas', 'Kelas'], ['/jadwal', 'cal', 'Jadwal'], ['/admin', 'school', 'Sekolah'], ['/profil', 'user', 'Profil']],
  parent: [['/ortu', 'home', 'Anak'], ['/profil', 'user', 'Profil']],
  super_admin: [['/admin/platform', 'school', 'Platform'], ['/profil', 'user', 'Profil']],
}
const HOME = { parent: '/ortu', super_admin: '/admin/platform' }

function Layout() {
  const { profile } = useAuth()
  const { brand, brandName, preview, setPreview } = useTheme()
  const loc = useLocation()
  const menu = MENUS[profile.role] || MENUS.student
  const banner = safeImg(brand.banner_url)
  return (
    <>
      <header className="top">
        <Link to={HOME[profile.role] || '/dashboard'} className="brand">
          {safeImg(brand.logo_url) ? <img className="logo-img" src={brand.logo_url} alt="" /> : <Logo />} {brandName}
        </Link>
        <nav className="tabs" aria-label="Navigasi utama">
          {menu.map(([to, ic, label]) => (
            <NavLink key={to} to={to} end={to === '/admin'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                {icons[ic]}
              </svg>
              {label}
            </NavLink>
          ))}
          {banner && brand.banner_position === 'sidebar' && <img className="side-banner" src={banner} alt="" />}
        </nav>
        <span className="who">{profile.full_name}</span>
      </header>
      <main className="page">
        {preview && (
          <div className="previewbar">
            <span>Mode pratinjau branding (belum disimpan)</span>
            <span className="row">
              <Link className="btn sm alt" to="/admin/settings/branding">
                Pengaturan
              </Link>
              <button className="btn sm" onClick={() => setPreview(null)}>
                Batalkan
              </button>
            </span>
          </div>
        )}
        {banner && brand.banner_position === 'top' && loc.pathname === '/dashboard' && <img className="cover" src={banner} alt="" />}
        <Outlet />
        <BrandFooter brand={brand} />
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
      <Route path="/sekolah/:slug" element={<SchoolLogin />} />

      <Route element={<Protected />}>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/profil" element={<Profile />} />
          <Route path="/pengaturan" element={<Settings />} />
          <Route path="/unauthorized" element={<Unauthorized />} />

          <Route element={<Protected roles={MEMBERS} />}>
            <Route path="/kelas" element={<ClassList />} />
            <Route path="/kelas/:id" element={<ClassDetail />} />
            <Route path="/kelas/:id/materi/:mid" element={<MaterialView />} />
            <Route path="/kelas/:id/tugas/:aid" element={<AssignmentView />} />
            <Route path="/kelas/:id/ujian/:eid" element={<ExamDetail />} />
            <Route path="/kelas/:id/ujian/:eid/hasil" element={<ExamResult />} />
            <Route path="/kelas/:id/ujian/:eid/hasil/:sid" element={<SubmissionReview />} />
            <Route path="/jadwal" element={<Schedule />} />
            <Route path="/absensi" element={<Attendance />} />
          </Route>

          <Route element={<Protected roles={STAFF} />}>
            <Route path="/kelas/baru" element={<ClassForm />} />
            <Route path="/kelas/:id/edit" element={<ClassForm />} />
            <Route path="/kelas/:id/materi/baru" element={<ItemForm kind="materi" />} />
            <Route path="/kelas/:id/materi/:mid/edit" element={<ItemForm kind="materi" />} />
            <Route path="/kelas/:id/tugas/baru" element={<ItemForm kind="tugas" />} />
            <Route path="/kelas/:id/tugas/:aid/edit" element={<ItemForm kind="tugas" />} />
            <Route path="/kelas/:id/ujian/baru" element={<ExamForm />} />
            <Route path="/kelas/:id/ujian/:eid/edit" element={<ExamForm />} />
            <Route path="/kelas/:id/ujian/:eid/soal" element={<ExamQuestions />} />
            <Route path="/kelas/:id/ujian/:eid/log" element={<ExamLog />} />
          </Route>
          <Route element={<Protected roles={['student']} />}>
            <Route path="/kelas/:id/ujian/:eid/kerjakan" element={<ExamTake />} />
          </Route>

          <Route element={<Protected roles={['parent']} />}>
            <Route path="/ortu" element={<ParentHome />} />
            <Route path="/ortu/:sid" element={<ParentChild />} />
          </Route>

          <Route element={<Protected roles={['school_admin']} />}>
            <Route path="/admin" element={<AdminHome />} />
            <Route path="/admin/tahun" element={<AdminYears />} />
            <Route path="/admin/mapel" element={<AdminSubjects />} />
            <Route path="/admin/pengguna" element={<AdminUsers />} />
            <Route path="/admin/settings/branding" element={<BrandingSettings />} />
          </Route>
          <Route element={<Protected roles={['super_admin']} />}>
            <Route path="/admin/platform" element={<PlatformAdmin />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}
