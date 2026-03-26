import { createClient } from '@supabase/supabase-js'
import { Database } from '../types/database'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase environment variables not set. Check your .env file.')
}

// Custom fetch with 12s timeout — prevents requests from hanging indefinitely
// when the auth token refresh is stuck.
function fetchWithTimeout(input: RequestInfo | URL, options: RequestInit = {}): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 12000)
  return fetch(input, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer))
}

export const supabase = createClient<Database>(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
    global: {
      fetch: fetchWithTimeout,
    },
  }
)

export type TypedSupabaseClient = typeof supabase
