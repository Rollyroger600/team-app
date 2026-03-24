import { supabase } from './supabase'

export async function checkEmailExists(email) {
  // Uses a SECURITY DEFINER RPC function to bypass RLS (unauthenticated check)
  const { data, error } = await supabase.rpc('check_email_exists', {
    p_email: email.toLowerCase()
  })
  return { exists: data === true, error }
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export async function resetPassword(email) {
  const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/set-password`
  })
  return { data, error }
}

export async function updatePassword(newPassword) {
  const { data, error } = await supabase.auth.updateUser({ password: newPassword })
  return { data, error }
}

export async function getSession() {
  const { data: { session } } = await supabase.auth.getSession()
  return session
}
