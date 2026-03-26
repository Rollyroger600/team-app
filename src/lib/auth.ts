import { supabase } from './supabase'
import type { AuthError, Session, User } from '@supabase/supabase-js'

export async function checkEmailExists(email: string): Promise<{ exists: boolean; error: AuthError | null }> {
  // Uses a SECURITY DEFINER RPC function to bypass RLS (unauthenticated check)
  const { data, error } = await supabase.rpc('check_email_exists', {
    p_email: email.toLowerCase()
  })
  return { exists: data === true, error: error as AuthError | null }
}

export async function signIn(email: string, password: string): Promise<{ data: { user: User | null; session: Session | null }; error: AuthError | null }> {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signOut(): Promise<{ error: AuthError | null }> {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function resetPassword(email: string): Promise<{ data: object | null; error: AuthError | null }> {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/set-password`
  })
  return { data, error }
}

export async function updatePassword(newPassword: string): Promise<{ data: { user: User | null }; error: AuthError | null }> {
  const { data, error } = await supabase.auth.updateUser({ password: newPassword })
  return { data, error }
}

export async function getSession(): Promise<Session | null> {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
