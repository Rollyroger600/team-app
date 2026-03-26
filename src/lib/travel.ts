import { supabase } from './supabase'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '../types/database'

const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY

type SupabaseDb = SupabaseClient<Database>

interface Coords {
  lat: number
  lng: number
}

interface ClubRegistryResult {
  data: Database['public']['Tables']['clubs_registry']['Row'] | null
  coords: Coords | null
  error: unknown
}

/**
 * Geocode an address to lat/lng using OpenRouteService
 */
export async function geocodeAddress(address: string): Promise<Coords | null> {
  if (!ORS_API_KEY || !address) return null
  try {
    const url = `https://api.openrouteservice.org/geocode/search?api_key=${ORS_API_KEY}&text=${encodeURIComponent(address)}&size=1&boundary.country=NL`
    const res = await fetch(url)
    if (!res.ok) throw new Error('Geocoding failed')
    const data = await res.json()
    const [lng, lat] = data.features[0]?.geometry?.coordinates || []
    return lat && lng ? { lat, lng } : null
  } catch (err) {
    console.error('Geocoding error:', err)
    return null
  }
}

/**
 * Get driving duration in minutes between two coordinates
 * Returns minutes (rounded up), or null on error
 */
export async function getTravelDuration(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number
): Promise<number | null> {
  if (!ORS_API_KEY) return null
  try {
    const url = `https://api.openrouteservice.org/v2/directions/driving-car?start=${fromLng},${fromLat}&end=${toLng},${toLat}`
    const res = await fetch(url, {
      headers: { 'Authorization': ORS_API_KEY }
    })
    if (!res.ok) throw new Error('Directions API failed')
    const data = await res.json()
    const durationSeconds = data.features[0]?.properties?.summary?.duration
    return durationSeconds ? Math.ceil(durationSeconds / 60) : null
  } catch (err) {
    console.error('Travel duration error:', err)
    return null
  }
}

/**
 * Search the clubs_registry for a club by name (fuzzy, case-insensitive)
 * Used for autocomplete when adding teams to a league
 */
export async function searchClubsRegistry(
  client: SupabaseDb,
  query: string
): Promise<Database['public']['Tables']['clubs_registry']['Row'][]> {
  if (!query || query.length < 2) return []
  const { data } = await client
    .from('clubs_registry')
    .select('id, name, short_name, street_address, postcode, city, address, latitude, longitude, primary_color, secondary_color, verified')
    .ilike('name', `%${query}%`)
    .order('verified', { ascending: false })
    .order('name')
    .limit(10)
  return (data as Database['public']['Tables']['clubs_registry']['Row'][]) || []
}

interface UpsertClubRegistryInput {
  name: string
  short_name?: string | null
  street_address?: string | null
  postcode?: string | null
  city?: string | null
  address?: string | null
  primary_color?: string | null
  secondary_color?: string | null
}

/**
 * Add or update a club in the shared registry.
 * Geocodes the address and stores lat/lng for future reuse.
 */
export async function upsertClubRegistry(
  client: SupabaseDb,
  { name, short_name, street_address, postcode, city, address, primary_color, secondary_color }: UpsertClubRegistryInput
): Promise<ClubRegistryResult> {
  // Build full address from parts if address not provided
  const fullAddress = address || [street_address, postcode, city].filter(Boolean).join(' ')

  let lat: number | null = null
  let lng: number | null = null
  if (fullAddress) {
    const coords = await geocodeAddress(fullAddress)
    if (coords) { lat = coords.lat; lng = coords.lng }
  }

  const { data, error } = await client
    .from('clubs_registry')
    .upsert({
      name,
      short_name: short_name || null,
      street_address: street_address || null,
      postcode: postcode || null,
      city: city || null,
      address: fullAddress || null,
      latitude: lat,
      longitude: lng,
      primary_color: primary_color || null,
      secondary_color: secondary_color || null,
    }, { onConflict: 'name', ignoreDuplicates: false })
    .select()
    .single()

  return { data, error, coords: lat ? { lat, lng: lng! } : null }
}

/**
 * Lazy geocoding: if a registry entry has an address but no coordinates,
 * geocode it now and save the result. Called when a club is first used
 * in a match context (travel time calculation).
 */
export async function ensureRegistryCoords(
  client: SupabaseDb,
  registryId: string
): Promise<Database['public']['Tables']['clubs_registry']['Row'] | null> {
  const { data: club } = await client
    .from('clubs_registry')
    .select('id, street_address, postcode, city, address, latitude, longitude')
    .eq('id', registryId)
    .single()

  type PartialClub = { id: string; street_address: string | null; postcode: string | null; city: string | null; address: string | null; latitude: number | null; longitude: number | null }
  const c = club as PartialClub | null

  if (!c || c.latitude) return c as Database['public']['Tables']['clubs_registry']['Row'] | null

  const fullAddress = c.address || [c.street_address, c.postcode, c.city].filter(Boolean).join(' ')
  if (!fullAddress) return c as Database['public']['Tables']['clubs_registry']['Row']

  const coords = await geocodeAddress(fullAddress)
  if (!coords) return c as Database['public']['Tables']['clubs_registry']['Row']

  await client
    .from('clubs_registry')
    .update({ latitude: coords.lat, longitude: coords.lng })
    .eq('id', registryId)

  return { ...c, latitude: coords.lat, longitude: coords.lng } as Database['public']['Tables']['clubs_registry']['Row']
}
