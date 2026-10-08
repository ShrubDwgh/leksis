import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'
import { useAuth } from './auth.jsx'

// Font memakai font bawaan perangkat: cepat, tanpa unduhan, dan CSP tetap ketat.
export const FONTS = {
  system: 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif',
  humanist: 'Seravek,"Gill Sans Nova",Ubuntu,Calibri,"DejaVu Sans","Source Sans Pro",sans-serif',
  serif: 'Charter,"Bitstream Charter","Sitka Text",Cambria,Georgia,serif',
  rounded: 'ui-rounded,"Hiragino Maru Gothic ProN",Quicksand,Comfortaa,"Arial Rounded MT","Arial Rounded MT Bold",Calibri,sans-serif',
}
export const FONT_LABELS = { system: 'Bawaan perangkat', humanist: 'Humanis', serif: 'Serif', rounded: 'Membulat' }

export const DEFAULT_BRAND = {
  name: 'Leksis', display_name: null, tagline: '', logo_url: null, banner_url: null, banner_position: 'hero',
  favicon_url: null, primary_color: '#0A2346', secondary_color: '#14407A', accent_color: '#1FB6E5',
  font_family: 'system', login_background_url: null, login_message: '', footer_text: '', contact_email: '',
  contact_phone: '', website_url: '', social_media: {}, theme_mode: 'light',
}

const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const lum = (hex) => {
  const n = parseInt(hex.slice(1), 16)
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
}
export const contrast = (a, b) => {
  const x = lum(a)
  const y = lum(b)
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
export const isHex = (v) => /^#[0-9a-fA-F]{6}$/.test(v || '')
export const onColor = (hex) => (contrast(hex, '#ffffff') >= contrast(hex, '#06263a') ? '#ffffff' : '#06263a')
export const safeImg = (u) => (/^https:\/\//i.test(u || '') ? u : null)
export const clean = (o) => Object.fromEntries(Object.entries(o || {}).filter(([, v]) => v !== null && v !== undefined && v !== ''))

const Ctx = createContext(null)
export const useTheme = () => useContext(Ctx)

export function ThemeProvider({ children }) {
  const { profile } = useAuth()
  const schoolId = profile?.school_id || null
  const [db, setDb] = useState(null) // branding sekolah dari database
  const [pub, setPub] = useState(null) // branding di halaman login sekolah (sebelum login)
  const [preview, setPreview] = useState(null) // pratinjau admin (belum disimpan)

  const load = useCallback(async () => {
    if (!schoolId) return setDb(null)
    const [{ data: s }, { data: b }] = await Promise.all([
      supabase.from('schools').select('name,logo_url').eq('id', schoolId).maybeSingle(),
      supabase.from('school_branding').select('*').eq('school_id', schoolId).maybeSingle(),
    ])
    setDb(s ? { ...DEFAULT_BRAND, ...clean(b), name: s.name, logo_url: s.logo_url } : null)
  }, [schoolId])

  // Branding diambil sekali saat login, lalu disegarkan saat tab kembali aktif atau setelah admin menyimpan.
  useEffect(() => {
    load()
  }, [load])
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && load()
    document.addEventListener('visibilitychange', f)
    return () => document.removeEventListener('visibilitychange', f)
  }, [load])

  const brand = preview || pub || db || DEFAULT_BRAND

  useEffect(() => {
    const root = document.documentElement
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = brand.theme_mode === 'dark' || (brand.theme_mode === 'system' && mql.matches)
      root.dataset.theme = dark ? 'dark' : 'light'
      root.style.setProperty('--navy', brand.primary_color)
      root.style.setProperty('--navy2', brand.secondary_color)
      root.style.setProperty('--cyan', brand.accent_color)
      root.style.setProperty('--on-accent', onColor(brand.accent_color))
      root.style.setProperty('--font', FONTS[brand.font_family] || FONTS.system)
    }
    apply()
    mql.addEventListener('change', apply)
    return () => mql.removeEventListener('change', apply)
  }, [brand])

  useEffect(() => {
    document.title = `${brand.display_name || brand.name} — ruang kelas digital`
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', brand.primary_color)
    let l = document.getElementById('dyn-favicon')
    const fav = safeImg(brand.favicon_url)
    if (fav) {
      if (!l) {
        l = document.createElement('link')
        l.id = 'dyn-favicon'
        l.rel = 'icon'
        document.head.appendChild(l)
      }
      if (l.getAttribute('href') !== fav) l.setAttribute('href', fav)
    } else if (l) l.remove()
  }, [brand])

  const value = useMemo(
    () => ({ brand, brandName: brand.display_name || brand.name, reload: load, preview, setPreview, setPub }),
    [brand, load, preview]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
