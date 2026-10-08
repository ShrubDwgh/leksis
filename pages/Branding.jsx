import { useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { supabase, q } from '../supabase.js'
import { useAuth } from '../auth.jsx'
import { Back, Field, Loading, Logo, Notice } from '../ui.jsx'
import { Badge } from '../ui.jsx'
import { LoginForm } from './Auth.jsx'
import { DEFAULT_BRAND, FONTS, FONT_LABELS, clean, contrast, isHex, onColor, safeImg, useTheme } from '../theme.jsx'

export function ColorField({ label, value, onChange }) {
  return (
    <div className="field">
      <span>{label}</span>
      <div className="colorrow">
        <input type="color" value={isHex(value) ? value : '#000000'} onChange={(e) => onChange(e.target.value.toUpperCase())} aria-label={`${label}: pemilih warna`} />
        <input value={value} maxLength={7} onChange={(e) => onChange(e.target.value)} aria-label={`${label}: kode hex`} />
      </div>
    </div>
  )
}

export function BrandFooter({ brand }) {
  const soc = Object.entries(brand.social_media || {}).filter(([, u]) => /^https?:\/\//i.test(u))
  const web = /^https?:\/\//i.test(brand.website_url || '') ? brand.website_url : null
  if (!brand.footer_text && !brand.contact_email && !brand.contact_phone && !web && !soc.length) return null
  return (
    <footer className="footer">
      {brand.footer_text && <p>{brand.footer_text}</p>}
      <p>
        {brand.contact_email && <a href={`mailto:${brand.contact_email}`}>{brand.contact_email}</a>}
        {brand.contact_phone && <a href={`tel:${brand.contact_phone.replace(/[^0-9+]/g, '')}`}>{brand.contact_phone}</a>}
        {web && (
          <a href={web} target="_blank" rel="noopener noreferrer">
            Situs sekolah
          </a>
        )}
      </p>
      {soc.length > 0 && (
        <p>
          {soc.map(([k, u]) => (
            <a key={k} href={u} target="_blank" rel="noopener noreferrer">
              {k}
            </a>
          ))}
        </p>
      )}
    </footer>
  )
}

function BrandPreview({ f, name }) {
  const dark = f.theme_mode === 'dark' || (f.theme_mode === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const style = { '--navy': f.primary_color, '--navy2': f.secondary_color, '--cyan': f.accent_color, '--on-accent': isHex(f.accent_color) ? onColor(f.accent_color) : '#fff', fontFamily: FONTS[f.font_family] }
  return (
    <div className="pv" data-theme={dark ? 'dark' : 'light'} style={style} aria-label="Pratinjau tampilan">
      <div className="pv-top">
        {safeImg(f.logo_url) ? <img className="logo-img" src={f.logo_url} alt="" /> : <Logo size={22} />}
        <span>{f.display_name || name}</span>
      </div>
      {safeImg(f.banner_url) && <img className="pv-banner" src={f.banner_url} alt="" />}
      <div className="pv-body">
        <b style={{ color: 'var(--ink)' }}>{f.tagline || 'Slogan sekolah'}</b>
        <p className="small" style={{ color: 'var(--muted)' }}>{f.login_message || 'Pesan sambutan tampil di halaman masuk.'}</p>
        <div className="row" style={{ margin: '.5rem 0' }}>
          <span className="btn sm">Tombol utama</span>
          <span className="btn sm cyan">Aksen</span>
          <span className="small" style={{ color: 'var(--link)' }}>Tautan</span>
        </div>
        <ul className="list" style={{ marginBottom: 0 }}>
          <li className="item">
            <div className="grow">
              <b>Contoh kelas</b>
              <span className="small muted">Guru: Bu Ani</span>
            </div>
            <Badge>Aktif</Badge>
          </li>
        </ul>
      </div>
    </div>
  )
}

function ImageField({ label, hint, value, onPick, onClear, busy }) {
  return (
    <div className="field">
      <span>{label}</span>
      {safeImg(value) && <img src={value} alt="" style={{ maxHeight: 80, maxWidth: '100%', display: 'block', margin: '.3rem 0', borderRadius: 6 }} />}
      <div className="row">
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { onPick(e.target.files[0]); e.target.value = '' }} aria-label={label} />
        {value && <button type="button" className="btn sm danger" onClick={onClear}>Hapus</button>}
      </div>
      <small>{hint || 'PNG, JPG, atau WebP, maksimal 2 MB.'}</small>
    </div>
  )
}

const toBrand = (f, school) => ({
  ...DEFAULT_BRAND,
  ...clean(f),
  name: school.name,
  logo_url: f.logo_url || null,
  social_media: Object.fromEntries(['instagram', 'facebook', 'youtube', 'twitter'].filter((k) => f[k]).map((k) => [k, f[k]])),
})

export function BrandingSettings() {
  const { profile } = useAuth()
  const sid = profile.school_id
  const { reload: reloadTheme } = useTheme()
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')
  const load = async () => {
    try {
      const [school, b, def] = await Promise.all([
        q(supabase.from('schools').select('id,name,slug,logo_url').eq('id', sid).maybeSingle()),
        q(supabase.from('school_branding').select('*').eq('school_id', sid).maybeSingle()),
        q(supabase.from('platform_branding').select('*').eq('id', 1).maybeSingle()),
      ])
      setData({ school, b: b || {}, def })
    } catch (e) {
      setErr(e.message)
    }
  }
  useEffect(() => {
    load()
  }, [sid]) // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <Notice kind="err">{err}</Notice>
  if (!data) return <Loading />
  return <BrandingForm key={data.b.updated_at || 'new'} sid={sid} {...data} onSaved={() => { reloadTheme(); load() }} />
}

function BrandingForm({ sid, school, b, def, onSaved }) {
  const { user } = useAuth()
  const { setPreview, preview } = useTheme()
  const orig = { logo_url: school.logo_url || '', banner_url: b.banner_url || '', favicon_url: b.favicon_url || '', login_background_url: b.login_background_url || '' }
  const soc = b.social_media || {}
  const [f, setF] = useState({
    display_name: b.display_name || '', tagline: b.tagline || '', ...orig,
    banner_position: b.banner_position || 'hero',
    primary_color: b.primary_color || def.primary_color, secondary_color: b.secondary_color || def.secondary_color, accent_color: b.accent_color || def.accent_color,
    font_family: b.font_family || def.font_family, theme_mode: b.theme_mode || def.theme_mode,
    login_message: b.login_message || '', footer_text: b.footer_text || '',
    contact_email: b.contact_email || '', contact_phone: b.contact_phone || '', website_url: b.website_url || '',
    instagram: soc.instagram || '', facebook: soc.facebook || '', youtube: soc.youtube || '', twitter: soc.twitter || '',
  })
  const [slug, setSlug] = useState(school.slug)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState('')
  const uploads = useRef([])
  const set = (k) => (e) => setF({ ...f, [k]: e && e.target ? e.target.value : e })
  const bad = (text) => setMsg({ kind: 'err', text })

  async function pick(kind, field, file) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return bad('Hanya PNG, JPG, atau WebP.')
    if (file.size > 2 * 1024 * 1024) return bad('Ukuran file maksimal 2 MB.')
    const now = Date.now()
    uploads.current = uploads.current.filter((t) => now - t < 60000)
    if (uploads.current.length >= 10) return bad('Terlalu banyak unggahan. Tunggu semenit.')
    uploads.current.push(now)
    setBusy(field)
    setMsg(null)
    const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[file.type]
    const path = `${sid}/${kind}-${now}.${ext}`
    const { error } = await supabase.storage.from('school-assets').upload(path, file, { contentType: file.type, cacheControl: '31536000' })
    setBusy('')
    if (error) return bad(`Gagal mengunggah: ${error.message}`)
    setF((x) => ({ ...x, [field]: supabase.storage.from('school-assets').getPublicUrl(path).data.publicUrl }))
  }

  async function save() {
    setMsg(null)
    if (![f.primary_color, f.secondary_color, f.accent_color].every(isHex)) return bad('Warna harus berformat #RRGGBB.')
    if (contrast(f.primary_color, '#ffffff') < 4.5) return bad('Warna utama terlalu terang: teks putih di header sulit dibaca. Pilih warna yang lebih gelap.')
    if (f.website_url && !/^https?:\/\//i.test(f.website_url)) return bad('Alamat situs harus diawali http:// atau https://')
    for (const k of ['instagram', 'facebook', 'youtube', 'twitter']) if (f[k] && !/^https?:\/\//i.test(f[k])) return bad(`Tautan ${k} harus diawali http:// atau https://`)
    if (f.contact_email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contact_email)) return bad('Format email tidak valid.')
    if (f.contact_phone && !/^[0-9+() -]{3,30}$/.test(f.contact_phone)) return bad('Nomor telepon hanya angka, spasi, +, -, dan tanda kurung.')
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 60) return bad('Alamat halaman login: huruf kecil, angka, dan tanda hubung.')
    setBusy('save')
    const nn = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    const payload = {
      school_id: sid, display_name: nn(f.display_name), tagline: nn(f.tagline), banner_url: nn(f.banner_url), banner_position: f.banner_position,
      favicon_url: nn(f.favicon_url), primary_color: f.primary_color, secondary_color: f.secondary_color, accent_color: f.accent_color,
      font_family: f.font_family, login_background_url: nn(f.login_background_url), login_message: nn(f.login_message), footer_text: nn(f.footer_text),
      contact_email: nn(f.contact_email), contact_phone: nn(f.contact_phone), website_url: nn(f.website_url), theme_mode: f.theme_mode,
      social_media: Object.fromEntries(['instagram', 'facebook', 'youtube', 'twitter'].filter((k) => nn(f[k])).map((k) => [k, f[k].trim()])),
    }
    const r1 = await supabase.from('school_branding').upsert(payload, { onConflict: 'school_id' })
    const r2 = r1.error ? r1 : await supabase.from('schools').update({ logo_url: nn(f.logo_url), slug }).eq('id', sid)
    setBusy('')
    if (r2.error) return bad(r2.error.message.includes('duplicate') ? 'Alamat halaman login itu sudah dipakai sekolah lain.' : r2.error.message)
    // buang berkas lama yang sudah diganti
    const old = Object.keys(orig).filter((k) => orig[k] && orig[k] !== f[k]).map((k) => (orig[k].split('/school-assets/')[1] || '')).filter((p) => p.startsWith(`${sid}/`))
    if (old.length) supabase.storage.from('school-assets').remove(old)
    setPreview(null)
    setMsg({ kind: 'ok', text: 'Branding tersimpan dan langsung berlaku. Perubahan dicatat di log audit.' })
    onSaved()
  }

  function resetDefault() {
    if (!window.confirm('Kembalikan warna, font, mode tema, pesan login, dan footer ke default platform? (Gambar tidak diubah. Tekan Simpan untuk menerapkan.)')) return
    setF({ ...f, primary_color: def.primary_color, secondary_color: def.secondary_color, accent_color: def.accent_color, font_family: def.font_family, theme_mode: def.theme_mode, login_message: def.login_message || '', footer_text: def.footer_text || '' })
  }

  async function mailReset() {
    const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/reset-password` })
    setMsg(error ? { kind: 'err', text: error.message } : { kind: 'ok', text: `Tautan atur ulang kata sandi dikirim ke ${user.email}.` })
  }

  const secLow = isHex(f.secondary_color) && contrast(f.secondary_color, '#ffffff') < 4.5
  return (
    <>
      <Back to="/admin">Sekolah</Back>
      <h1>Branding sekolah</h1>
      <div className="sec"><h2>Pratinjau</h2></div>
      <BrandPreview f={f} name={school.name} />
      <div className="row" style={{ margin: '.6rem 0' }}>
        <button className="btn sm alt" onClick={() => { setPreview(toBrand(f, school)); setMsg({ kind: '', text: 'Pratinjau aktif di seluruh aplikasi. Buka halaman lain untuk melihatnya, lalu kembali ke sini untuk menyimpan.' }) }}>
          Pratinjau di seluruh aplikasi
        </button>
        {preview && <button className="btn sm alt" onClick={() => setPreview(null)}>Batalkan pratinjau</button>}
      </div>

      <div className="sec"><h2>Identitas</h2></div>
      <Field label="Nama tampilan" hint="Boleh berbeda dari nama resmi."><input maxLength={100} value={f.display_name} onChange={set('display_name')} placeholder={school.name} /></Field>
      <Field label="Slogan / motto"><input maxLength={160} value={f.tagline} onChange={set('tagline')} /></Field>
      <ImageField label="Logo" value={f.logo_url} busy={busy === 'logo_url'} onPick={(file) => pick('logo', 'logo_url', file)} onClear={() => setF({ ...f, logo_url: '' })} hint="Disarankan persegi, latar transparan. PNG, JPG, atau WebP, maks. 2 MB." />
      <ImageField label="Favicon" value={f.favicon_url} busy={busy === 'favicon_url'} onPick={(file) => pick('favicon', 'favicon_url', file)} onClear={() => setF({ ...f, favicon_url: '' })} hint="Gambar persegi kecil (mis. 64×64). Maks. 2 MB." />
      <ImageField label="Banner" value={f.banner_url} busy={busy === 'banner_url'} onPick={(file) => pick('banner', 'banner_url', file)} onClear={() => setF({ ...f, banner_url: '' })} />
      <Field label="Posisi banner">
        <select value={f.banner_position} onChange={set('banner_position')}>
          <option value="hero">Hero (latar bagian atas halaman masuk)</option>
          <option value="top">Atas (di atas halaman masuk dan beranda)</option>
          <option value="sidebar">Samping (halaman masuk dan sidebar di layar lebar)</option>
        </select>
      </Field>
      <ImageField label="Latar halaman masuk" value={f.login_background_url} busy={busy === 'login_background_url'} onPick={(file) => pick('loginbg', 'login_background_url', file)} onClear={() => setF({ ...f, login_background_url: '' })} />
      <Field label="Pesan sambutan di halaman masuk"><textarea style={{ minHeight: 80 }} maxLength={500} value={f.login_message} onChange={set('login_message')} /></Field>
      <Field label="Alamat halaman masuk sekolah" hint={`${window.location.origin}/sekolah/${slug}`}>
        <input value={slug} maxLength={60} onChange={(e) => setSlug(e.target.value.toLowerCase())} />
      </Field>

      <div className="sec"><h2>Warna & tampilan</h2></div>
      <ColorField label="Warna utama (header, tombol)" value={f.primary_color} onChange={set('primary_color')} />
      <ColorField label="Warna sekunder (tautan)" value={f.secondary_color} onChange={set('secondary_color')} />
      {secLow && <Notice>Warna sekunder agak terang di latar putih, tautan bisa sulit dibaca.</Notice>}
      <ColorField label="Warna aksen" value={f.accent_color} onChange={set('accent_color')} />
      <Field label="Font" hint="Memakai font bawaan perangkat: cepat dan tidak mengunduh apa pun.">
        <select value={f.font_family} onChange={set('font_family')}>
          {Object.entries(FONT_LABELS).map(([v, l]) => <option key={v} value={v} style={{ fontFamily: FONTS[v] }}>{l}</option>)}
        </select>
      </Field>
      <Field label="Mode tema bawaan">
        <select value={f.theme_mode} onChange={set('theme_mode')}>
          <option value="light">Terang</option>
          <option value="dark">Gelap</option>
          <option value="system">Ikuti perangkat</option>
        </select>
      </Field>

      <div className="sec"><h2>Kontak & footer</h2></div>
      <Field label="Teks footer"><input maxLength={300} value={f.footer_text} onChange={set('footer_text')} /></Field>
      <Field label="Email sekolah"><input type="email" maxLength={150} value={f.contact_email} onChange={set('contact_email')} /></Field>
      <Field label="Telepon"><input inputMode="tel" maxLength={30} value={f.contact_phone} onChange={set('contact_phone')} /></Field>
      <Field label="Situs resmi"><input type="url" maxLength={300} value={f.website_url} onChange={set('website_url')} placeholder="https://" /></Field>
      {['instagram', 'facebook', 'youtube', 'twitter'].map((k) => (
        <Field key={k} label={`Tautan ${k[0].toUpperCase()}${k.slice(1)}`}><input type="url" maxLength={300} value={f[k]} onChange={set(k)} placeholder="https://" /></Field>
      ))}

      {msg && <Notice kind={msg.kind}>{msg.text}</Notice>}
      <div className="row">
        <button className="btn" disabled={Boolean(busy)} onClick={save}>{busy === 'save' ? 'Menyimpan…' : 'Simpan'}</button>
        <button className="btn alt" onClick={resetDefault}>Reset ke default</button>
      </div>
      <div className="sec"><h2>Keamanan akun admin</h2></div>
      <button className="btn alt" onClick={mailReset}>Kirim tautan atur ulang kata sandi ke email saya</button>
    </>
  )
}

/* ---------------- Halaman masuk berbranding: /sekolah/:slug ---------------- */
export function SchoolLogin() {
  const { slug } = useParams()
  const { session } = useAuth()
  const { setPub } = useTheme()
  const [st, setSt] = useState({ loading: true, brand: null })

  useEffect(() => {
    let alive = true
    supabase.rpc('school_public', { p_slug: slug }).then(({ data }) => {
      if (!alive) return
      if (data) {
        const brand = { ...DEFAULT_BRAND, ...clean(data) }
        setSt({ loading: false, brand })
        setPub(brand)
      } else setSt({ loading: false, brand: null })
    })
    return () => {
      alive = false
      setPub(null)
    }
  }, [slug, setPub])

  if (session) return <Navigate to="/dashboard" replace />
  if (st.loading) return <Loading full />
  const b = st.brand
  if (!b)
    return (
      <div className="authbox center">
        <Logo size={48} />
        <h1>Sekolah tidak ditemukan</h1>
        <p className="muted">Periksa kembali alamat halaman masuk dari sekolah Anda.</p>
        <Link className="btn" to="/login">Masuk biasa</Link>
      </div>
    )
  const name = b.display_name || b.name
  const banner = safeImg(b.banner_url)
  const bg = safeImg(b.login_background_url) || banner
  const head = (
    <>
      <div className="row" style={{ marginBottom: '.5rem' }}>
        {safeImg(b.logo_url) ? <img className="logo-img" style={{ height: 44, width: 44 }} src={b.logo_url} alt="" /> : <Logo size={44} />}
        <h1>{name}</h1>
      </div>
      {b.tagline && <p><b>{b.tagline}</b></p>}
      {b.login_message && <p className="pre">{b.login_message}</p>}
    </>
  )
  return (
    <div className={`sl-wrap ${b.banner_position === 'sidebar' && banner ? 'side' : ''}`}>
      {b.banner_position === 'sidebar' && banner && <img className="sl-side" src={banner} alt="" />}
      <div>
        {b.banner_position === 'top' && banner && <img className="sl-banner" src={banner} alt="" />}
        <div className="authbox">
          {b.banner_position === 'hero' ? (
            <div className="hero-bg" style={bg ? { backgroundImage: `url("${bg}")`, backgroundColor: '#666', backgroundBlendMode: 'multiply' } : { background: 'var(--navy)' }}>
              {head}
            </div>
          ) : (
            head
          )}
          <h2 style={{ margin: '1rem 0 .2rem' }}>Masuk</h2>
          <LoginForm />
          <p className="small muted" style={{ marginTop: '1rem' }}>
            Belum punya akun? <Link to="/register">Daftar</Link> · <Link to="/forgot-password">Lupa kata sandi</Link>
          </p>
          <BrandFooter brand={b} />
        </div>
      </div>
    </div>
  )
}
