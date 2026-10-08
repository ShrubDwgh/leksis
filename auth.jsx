import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase.js'

const Ctx = createContext(null)
export const useAuth = () => useContext(Ctx)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(undefined) // undefined = belum tahu
  const [profile, setProfile] = useState(undefined)
  const [ver, setVer] = useState(0)

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session ?? null))
      .catch(() => setSession(null))
    const { data } = supabase.auth.onAuthStateChange((_event, s) => setSession(s ?? null))
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user?.id
  const unknown = session === undefined

  useEffect(() => {
    if (unknown) return
    if (!uid) {
      setProfile(null)
      return
    }
    let alive = true
    supabase
      .from('profiles')
      .select('id,full_name,role,school_id,nis')
      .eq('id', uid)
      .maybeSingle()
      .then(({ data }) => alive && setProfile(data ?? null))
    return () => {
      alive = false
    }
  }, [uid, unknown, ver])

  const refresh = useCallback(() => setVer((v) => v + 1), [])
  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({
      session,
      user: session?.user ?? null,
      profile: profile ?? null,
      loading: unknown || (Boolean(uid) && profile === undefined),
      isTeacher: profile?.role === 'teacher' || profile?.role === 'school_admin',
      isAdmin: profile?.role === 'school_admin',
      isSuper: profile?.role === 'super_admin',
      isParent: profile?.role === 'parent',
      isStudent: profile?.role === 'student',
      refresh,
      signOut,
    }),
    [session, profile, unknown, uid, refresh, signOut]
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}
