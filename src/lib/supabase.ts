import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const key = import.meta.env.VITE_SUPABASE_ANON_KEY

let client: SupabaseClient | null = null

/** Browser Supabase client (optional — API + Prisma is primary). */
export function getSupabase(): SupabaseClient | null {
  if (!url || !key) return null
  if (!client) {
    client = createClient(url, key)
  }
  return client
}

export const supabaseConfigured = Boolean(url && key)
