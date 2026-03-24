const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY

/**
 * Geocode an address to lat/lng using OpenRouteService
 * @returns {{ lat: number, lng: number } | null}
 */
export async function geocodeAddress(address) {
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
 * @returns {number | null} minutes (rounded up), or null on error
 */
export async function getTravelDuration(fromLat, fromLng, toLat, toLng) {
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
export async function searchClubsRegistry(supabase, query) {
  if (!query || query.length < 2) return []
  const { data } = await supabase
    .from('clubs_registry')
    .select('id, name, short_name, street_address, postcode, city, address, latitude, longitude, primary_color, secondary_color, verified')
    .ilike('name', `%${query}%`)
    .order('verified', { ascending: false })
    .order('name')
    .limit(10)
  return data || []
}

/**
 * Add or update a club in the shared registry.
 * Geocodes the address and stores lat/lng for future reuse.
 */
export async function upsertClubRegistry(supabase, { name, short_name, street_address, postcode, city, address, primary_color, secondary_color }) {
  // Bouw volledig adres op uit losse velden als address niet meegegeven
  const fullAddress = address || [street_address, postcode, city].filter(Boolean).join(' ')

  let lat = null
  let lng = null
  if (fullAddress) {
    const coords = await geocodeAddress(fullAddress)
    if (coords) { lat = coords.lat; lng = coords.lng }
  }

  const { data, error } = await supabase
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

  return { data, error, coords: lat ? { lat, lng } : null }
}

/**
 * Lazy geocoding: if a registry entry has an address but no coordinates,
 * geocode it now and save the result. Called when a club is first used
 * in a match context (travel time calculation).
 */
export async function ensureRegistryCoords(supabase, registryId) {
  const { data: club } = await supabase
    .from('clubs_registry')
    .select('id, street_address, postcode, city, address, latitude, longitude')
    .eq('id', registryId)
    .single()

  if (!club || club.latitude) return club  // already has coords

  const fullAddress = club.address || [club.street_address, club.postcode, club.city].filter(Boolean).join(' ')
  if (!fullAddress) return club

  const coords = await geocodeAddress(fullAddress)
  if (!coords) return club

  await supabase
    .from('clubs_registry')
    .update({ latitude: coords.lat, longitude: coords.lng })
    .eq('id', registryId)

  return { ...club, latitude: coords.lat, longitude: coords.lng }
}
