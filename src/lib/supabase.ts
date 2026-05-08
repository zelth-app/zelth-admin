import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ibmuklnrriilwqsveysn.supabase.co'
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''
export const SERVICE_SECRET = import.meta.env.VITE_SERVICE_SECRET || ''
export const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'zelth@admin2026'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
export const supabaseAdmin = createClient(
  SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_SERVICE_KEY || '',
  { auth: { autoRefreshToken: false, persistSession: false } }
)
export const EDGE_BASE = SUPABASE_URL + '/functions/v1'

export async function callEdge(fn: string, body: Record<string, unknown>) {
  const res = await fetch(`${EDGE_BASE}/${fn}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Edge function error')
  return data
}
