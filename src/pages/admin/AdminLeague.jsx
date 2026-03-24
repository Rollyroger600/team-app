import { useEffect, useState, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Trophy, Search, X, Check, Trash2, ChevronRight, PlusCircle, MapPin, Car } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import { geocodeAddress, getTravelDuration } from '../../lib/travel'

// --- Debounce hook ---
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// --- Create league form ---
function CreateLeagueForm({ teamId, onCreated }) {
  const [name, setName] = useState('')
  const [season, setSeason] = useState('2025-2026')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')

    const { data, error: err } = await supabase
      .from('leagues')
      .insert({ team_id: teamId, name: name.trim(), season: season.trim() })
      .select()
      .single()

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    onCreated(data)
  }

  return (
    <div
      className="rounded-xl border p-6"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
          <Trophy size={20} className="text-amber-400" />
        </div>
        <div>
          <h2 className="font-semibold">Nieuwe poule aanmaken</h2>
          <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
            Vul de competitiegegevens in
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Poulenaam
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="bijv. Heren 30+ Hoofdklasse"
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
            Seizoen
          </label>
          <input
            type="text"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="2025-2026"
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
            style={{
              backgroundColor: 'var(--color-surface-2)',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text)',
            }}
          />
        </div>

        {error && (
          <p className="text-sm text-red-400">{error}</p>
        )}

        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full py-3 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-secondary)', color: '#0f172a' }}
        >
          {saving ? 'Aanmaken...' : 'Poule aanmaken'}
        </button>
      </form>
    </div>
  )
}

// --- Add team form with autocomplete ---
function AddTeamForm({ leagueId, onAdded }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedClub, setSelectedClub] = useState(null) // from registry
  const [isNewClub, setIsNewClub] = useState(false)
  const [newClubName, setNewClubName] = useState('')
  const [newClubAddress, setNewClubAddress] = useState('')
  const [teamSuffix, setTeamSuffix] = useState('')
  const [isOwnTeam, setIsOwnTeam] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const searchRef = useRef(null)
  const dropdownRef = useRef(null)

  const debouncedQuery = useDebounce(searchQuery, 300)

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    searchClubs(debouncedQuery)
  }, [debouncedQuery])

  async function searchClubs(q) {
    const { data } = await supabase
      .from('clubs_registry')
      .select('*')
      .ilike('name', `%${q}%`)
      .limit(8)
    setSearchResults(data || [])
    setShowDropdown(true)
  }

  function selectClub(club) {
    setSelectedClub(club)
    setSearchQuery(club.name)
    setIsNewClub(false)
    setShowDropdown(false)
    setNewClubName('')
    setNewClubAddress('')
  }

  function selectNewClub() {
    setSelectedClub(null)
    setIsNewClub(true)
    setNewClubName(searchQuery)
    setShowDropdown(false)
  }

  function clearSelection() {
    setSelectedClub(null)
    setIsNewClub(false)
    setSearchQuery('')
    setTeamSuffix('')
    setIsOwnTeam(false)
    setNewClubName('')
    setNewClubAddress('')
    searchRef.current?.focus()
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      let registryId = selectedClub?.id || null
      let clubName = selectedClub?.name || newClubName.trim()

      if (!clubName) {
        setError('Voer een clubnaam in')
        setSaving(false)
        return
      }

      const teamName = teamSuffix.trim() ? `${clubName} ${teamSuffix.trim()}` : clubName

      const { data: insData, error: insertErr } = await supabase
        .from('league_teams')
        .insert({ league_id: leagueId, registry_id: registryId, team_name: teamName, is_own_team: isOwnTeam })
        .select('id')
        .single()

      if (insertErr) {
        setError('Opslaan mislukt: ' + insertErr.message)
        setSaving(false)
        return
      }

      setSelectedClub(null)
      setIsNewClub(false)
      setSearchQuery('')
      setTeamSuffix('')
      setIsOwnTeam(false)
      setNewClubName('')
      setNewClubAddress('')
      setSaving(false)
      onAdded()
      searchRef.current?.focus()
    } catch (err) {
      setError('Fout: ' + err.message)
      setSaving(false)
    }
  }

  const showForm = selectedClub !== null || isNewClub

  return (
    <div
      className="rounded-xl border p-4"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <h3 className="font-semibold text-sm mb-3">Teams toevoegen</h3>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Search / club name input */}
        {!showForm ? (
          <div className="relative">
            <div className="relative">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: 'var(--color-text-muted)' }}
              />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.length >= 2 && setShowDropdown(true)}
                placeholder="Zoek club (bijv. HC Leiden)"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />
            </div>

            {/* Dropdown */}
            {showDropdown && (
              <div
                ref={dropdownRef}
                className="absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-xl z-20 overflow-hidden"
                style={{
                  backgroundColor: 'var(--color-surface)',
                  borderColor: 'var(--color-border)',
                }}
              >
                {searchResults.length > 0 ? (
                  <>
                    {searchResults.map((club) => (
                      <button
                        key={club.id}
                        type="button"
                        onClick={() => selectClub(club)}
                        className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b last:border-0 flex items-start gap-2"
                        style={{ borderColor: 'var(--color-border)' }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{club.name}</p>
                          {club.address && (
                            <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>
                              {club.address}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={selectNewClub}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center gap-2"
                      style={{ color: 'var(--color-text-muted)' }}
                    >
                      <PlusCircle size={14} />
                      <span className="text-sm">Toevoegen als nieuwe club: "{searchQuery}"</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={selectNewClub}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center gap-2"
                    style={{ color: 'var(--color-text-muted)' }}
                  >
                    <PlusCircle size={14} />
                    <span className="text-sm">Nieuwe club toevoegen: "{searchQuery}"</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          // Selected club display
          <div
            className="flex items-center gap-2 px-3 py-2.5 rounded-lg border"
            style={{ backgroundColor: 'var(--color-surface-2)', borderColor: 'var(--color-border)' }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {selectedClub ? selectedClub.name : newClubName || searchQuery}
              </p>
              {selectedClub?.address && (
                <p className="text-xs flex items-center gap-1 mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
                  <MapPin size={10} />
                  {selectedClub.address}
                </p>
              )}
              {isNewClub && <span className="text-xs text-amber-400">Nieuwe club</span>}
            </div>
            <button type="button" onClick={clearSelection}>
              <X size={16} style={{ color: 'var(--color-text-muted)' }} />
            </button>
          </div>
        )}

        {/* New club fields */}
        {isNewClub && (
          <div className="space-y-2">
            <input
              type="text"
              value={newClubName}
              onChange={(e) => setNewClubName(e.target.value)}
              placeholder="Clubnaam"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
              required
            />
            <input
              type="text"
              value={newClubAddress}
              onChange={(e) => setNewClubAddress(e.target.value)}
              placeholder="Adres (optioneel)"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{
                backgroundColor: 'var(--color-surface-2)',
                border: '1px solid var(--color-border)',
                color: 'var(--color-text)',
              }}
            />
          </div>
        )}

        {/* Team suffix (when club selected or new) */}
        {showForm && (
          <>
            <div>
              <label className="block text-xs mb-1.5" style={{ color: 'var(--color-text-muted)' }}>
                Team suffix <span style={{ color: 'var(--color-text-muted)' }}>(optioneel, bijv. H30-1)</span>
              </label>
              <input
                type="text"
                value={teamSuffix}
                onChange={(e) => setTeamSuffix(e.target.value)}
                placeholder="bijv. H30-1"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none"
                style={{
                  backgroundColor: 'var(--color-surface-2)',
                  border: '1px solid var(--color-border)',
                  color: 'var(--color-text)',
                }}
              />
              {teamSuffix && (
                <p className="text-xs mt-1 text-amber-400">
                  Teamnaam: {selectedClub?.name || newClubName || searchQuery} {teamSuffix}
                </p>
              )}
            </div>

            {/* Own team checkbox */}
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setIsOwnTeam(!isOwnTeam)}
                className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors ${
                  isOwnTeam ? '' : 'border'
                }`}
                style={{
                  backgroundColor: isOwnTeam ? 'var(--color-secondary)' : 'transparent',
                  borderColor: 'var(--color-border)',
                }}
              >
                {isOwnTeam && <Check size={12} color="#0f172a" strokeWidth={3} />}
              </div>
              <span className="text-sm">Dit is ons eigen team</span>
            </label>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-50"
              style={{ backgroundColor: 'var(--color-secondary)', color: '#0f172a' }}
            >
              {saving ? 'Toevoegen...' : 'Team toevoegen'}
            </button>
          </>
        )}
      </form>
    </div>
  )
}

// --- Teams list ---
function TeamsList({ teams, totalSlots, onDelete }) {
  if (teams.length === 0) {
    return (
      <div
        className="rounded-xl border p-6 text-center"
        style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
      >
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Nog geen teams toegevoegd
        </p>
      </div>
    )
  }

  return (
    <div
      className="rounded-xl border overflow-hidden"
      style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
    >
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--color-border)' }}>
        <h3 className="font-semibold text-sm">Teams in deze poule</h3>
        <span className="text-xs px-2 py-0.5 rounded-full" style={{ backgroundColor: 'var(--color-surface-2)', color: 'var(--color-text-muted)' }}>
          {teams.length}{totalSlots ? ` van ${totalSlots}` : ''} teams
        </span>
      </div>

      <div className="divide-y" style={{ borderColor: 'var(--color-border)' }}>
        {teams.map((team) => (
          <div
            key={team.id}
            className="flex items-center gap-3 px-4 py-3"
          >
            {/* Own team indicator */}
            <div
              className={`w-2 h-2 rounded-full flex-shrink-0 ${team.is_own_team ? 'bg-amber-400' : 'bg-slate-600'}`}
            />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${team.is_own_team ? 'text-amber-400' : ''}`}>
                {team.team_name}
              </p>
              {team.is_own_team && (
                <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>Eigen team</p>
              )}
            </div>
            <button
              onClick={() => onDelete(team.id)}
              className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors flex-shrink-0"
            >
              <Trash2 size={14} className="text-slate-500 hover:text-red-400" />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Travel time calculator ---
function TravelTimeCalc({ teamId }) {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [log, setLog] = useState([])

  async function calculate() {
    setRunning(true)
    setDone(false)
    setLog([])
    const lines = []

    // 1. Haal thuislocatie op via clubs_registry
    const { data: team } = await supabase
      .from('teams')
      .select('clubs(registry_id, clubs_registry(latitude, longitude, street_address, postcode, city, address))')
      .eq('id', teamId)
      .single()

    let homeLat = null, homeLng = null
    const reg = team?.clubs?.clubs_registry

    if (reg) {
      homeLat = reg.latitude
      homeLng = reg.longitude
      if (!homeLat) {
        const fullAddress = [reg.street_address, reg.postcode, reg.city].filter(Boolean).join(' ') || reg.address
        if (fullAddress) {
          const coords = await geocodeAddress(fullAddress)
          if (coords) {
            homeLat = coords.lat; homeLng = coords.lng
            // Sla op voor later hergebruik
            await supabase.from('clubs_registry').update({ latitude: homeLat, longitude: homeLng }).eq('id', team.clubs.registry_id)
          }
        }
      }
    }

    if (!homeLat) {
      setLog(['Thuisclub niet gekoppeld aan clubs_registry. Controleer de club via Supabase.'])
      setRunning(false)
      return
    }

    // 2. Alle uitwedstrijden met league_match_id ophalen (ook al berekende — overschrijven)
    const { data: awayMatches } = await supabase
      .from('matches')
      .select('id, opponent, league_match_id')
      .eq('team_id', teamId)
      .eq('is_home', false)
      .not('league_match_id', 'is', null)

    if (!awayMatches?.length) {
      setLog([{ text: 'Geen uitwedstrijden met competitiekoppeling gevonden.', ok: false }])
      setRunning(false)
      setDone(true)
      return
    }

    // 3. Locatiedata per league_match ophalen
    const { data: leagueMatches } = await supabase
      .from('league_matches')
      .select('id, league_teams!home_team_id(registry_id, team_name, clubs_registry(latitude, longitude, street_address, postcode, city, address))')
      .in('id', awayMatches.map(m => m.league_match_id))

    const lmMap = {}
    for (const lm of leagueMatches || []) lmMap[lm.id] = lm

    // 4. Reistijd berekenen per wedstrijd
    for (const match of awayMatches) {
      const lm = lmMap[match.league_match_id]
      const reg = lm?.league_teams?.clubs_registry
      let toLat = reg?.latitude
      let toLng = reg?.longitude

      if (!toLat && reg) {
        const fullAddress = [reg.street_address, reg.postcode, reg.city].filter(Boolean).join(' ') || reg.address
        if (fullAddress) {
          const coords = await geocodeAddress(fullAddress)
          if (coords) {
            toLat = coords.lat; toLng = coords.lng
            if (reg.latitude === null) await supabase.from('clubs_registry').update({ latitude: toLat, longitude: toLng }).eq('id', lm.league_teams.registry_id)
          }
        }
      }

      if (!toLat) {
        lines.push({ text: `${match.opponent}: geen adres bekend`, ok: false })
        continue
      }

      const minutes = await getTravelDuration(homeLat, homeLng, toLat, toLng)
      if (minutes) {
        const { error: saveErr } = await supabase
          .from('matches')
          .update({ travel_duration_minutes: minutes })
          .eq('id', match.id)
        if (saveErr) {
          lines.push({ text: `${match.opponent}: ${minutes} min (opslaan mislukt: ${saveErr.message})`, ok: false })
        } else {
          lines.push({ text: `${match.opponent}: ${minutes} min ✓`, ok: true })
        }
      } else {
        lines.push({ text: `${match.opponent}: berekening mislukt`, ok: false })
      }
    }

    const saved = lines.filter(l => l.ok).length
    lines.push({ text: `Klaar. ${saved}/${lines.length} opgeslagen. Verzameltijden worden bijgewerkt zodra je teruggaat.`, ok: null })
    setLog(lines)
    setRunning(false)
    setDone(true)
  }

  return (
    <div className="rounded-xl border p-4 space-y-3"
         style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Reistijden berekenen</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-muted)' }}>
            Berekent en overschrijft reistijden voor alle uitwedstrijden
          </p>
        </div>
        <button
          onClick={calculate}
          disabled={running}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors"
          style={{ backgroundColor: 'var(--color-secondary)', color: '#0f172a' }}
        >
          <Car size={14} />
          {running ? 'Bezig...' : 'Bereken'}
        </button>
      </div>

      {log.length > 0 && (
        <div className="rounded-lg p-2 text-xs space-y-0.5"
             style={{ backgroundColor: '#0f172a' }}>
          {log.map((line, i) => (
            <div key={i} className={
              typeof line === 'string' ? 'text-slate-400' :
              line.ok === null ? 'text-slate-400 mt-1 border-t pt-1' :
              line.ok ? 'text-green-400' : 'text-red-400'
            }>
              {typeof line === 'string' ? line : line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Main component ---
export default function AdminLeague() {
  const { activeTeam } = useTeamStore()
  const [loading, setLoading] = useState(true)
  const [league, setLeague] = useState(null)
  const [teams, setTeams] = useState([])

  useEffect(() => {
    if (!activeTeam?.id) return
    loadLeague()
  }, [activeTeam?.id])

  async function loadLeague() {
    setLoading(true)
    const { data } = await supabase
      .from('leagues')
      .select('*')
      .eq('team_id', activeTeam.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    setLeague(data || null)
    if (data) await loadTeams(data.id)
    setLoading(false)
  }

  async function loadTeams(leagueId) {
    const { data } = await supabase
      .from('league_teams')
      .select('*')
      .eq('league_id', leagueId)
      .order('created_at', { ascending: true })
    setTeams(data || [])
  }

  async function handleDelete(teamId) {
    await supabase.from('league_teams').delete().eq('id', teamId)
    setTeams((prev) => prev.filter((t) => t.id !== teamId))
  }

  function handleLeagueCreated(newLeague) {
    setLeague(newLeague)
    setTeams([])
  }

  if (loading) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 pt-2 mb-6">
          <Link to="/admin" style={{ color: 'var(--color-text-muted)' }}>
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold">Competitie</h1>
        </div>
        <div className="flex items-center justify-center h-40">
          <div
            className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
            style={{ borderColor: 'var(--color-secondary)' }}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" style={{ color: 'var(--color-text-muted)' }} className="hover:text-slate-200">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">Competitie</h1>
          {league && (
            <p className="text-sm truncate" style={{ color: 'var(--color-text-muted)' }}>
              {league.name} · {league.season}
            </p>
          )}
        </div>
        {league && (
          <Link
            to="/admin/league/matches"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium"
            style={{ backgroundColor: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-muted)' }}
          >
            Wedstrijden
            <ChevronRight size={14} />
          </Link>
        )}
      </div>

      {/* No league yet */}
      {!league ? (
        <CreateLeagueForm teamId={activeTeam?.id} onCreated={handleLeagueCreated} />
      ) : (
        <>
          {/* Navigation shortcuts */}
          <div className="grid grid-cols-2 gap-3">
            <Link
              to="/admin/league/matches"
              className="flex items-center gap-3 p-3 rounded-xl border transition-colors hover:border-slate-500"
              style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-purple-400 text-sm">📅</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Wedstrijden invoeren</p>
                <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>Programma</p>
              </div>
            </Link>
            <Link
              to="/admin/league/results"
              className="flex items-center gap-3 p-3 rounded-xl border transition-colors hover:border-slate-500"
              style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}
            >
              <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-pink-400 text-sm">🏆</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Uitslagen invoeren</p>
                <p className="text-xs truncate" style={{ color: 'var(--color-text-muted)' }}>Resultaten</p>
              </div>
            </Link>
          </div>

          {/* Travel time calculator */}
          <TravelTimeCalc teamId={activeTeam?.id} />

          {/* Add team form */}
          <AddTeamForm
            leagueId={league.id}
            onAdded={() => loadTeams(league.id)}
          />

          {/* Teams list */}
          <TeamsList
            teams={teams}
            totalSlots={null}
            onDelete={handleDelete}
          />
        </>
      )}
    </div>
  )
}
