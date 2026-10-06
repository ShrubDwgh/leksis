import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

// Hanya URL + publishable key yang dipakai di browser. Keamanan data dijaga oleh RLS di database.
export const configured = Boolean(url && key)
export const supabase = createClient(url || 'https://example.invalid', key || 'missing-key')

// Bungkus hasil query Supabase: lempar error jika gagal, kembalikan data jika berhasil.
export async function q(request) {
  const { data, error } = await request
  if (error) throw new Error(error.message)
  return data
}

// Relasi one-to-one kadang kembali sebagai array, kadang objek.
export const one = (x) => (Array.isArray(x) ? x[0] ?? null : x ?? null)
