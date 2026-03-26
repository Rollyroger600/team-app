import React from 'react'
import { useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, Trophy, Search, X, Check, Trash2, ChevronRight, PlusCircle, MapPin, Car } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageLoader from '../../components/ui/PageLoader'
import { supabase } from '../../lib/supabase'
import useTeamStore from '../../stores/useTeamStore'
import { geocodeAddress, getTravelDuration } from '../../lib/travel'
import type { League, LeagueTeam } from '../../types/app'

interface ClubRegistryRow {
  id: string
  name: string
  address: string | null
  latitude: number | null
  longitude: number | null
  street_address: string | null
  postcode: string | null
  city: string | null
}

interface LeagueQueryData {
  league: League | null
  teams: LeagueTeam[]
}

interface LogLine {
  text: string
  ok: boolean | null
}

// --- Debounce hook ---
function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// --- Create league form ---
interface CreateLeagueFormProps {
  teamId: string | undefined
  onCreated: (league: League) => void
}

function CreateLeagueForm({ teamId, onCreated }: CreateLeagueFormProps): React.JSX.Element {
  const [name, setName] = useState('')
  const [season, setSeason] = useState('2025-2026')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')

    const { data, error: err } = await supabase
      .from('leagues')
      .insert({ team_id: teamId!, name: name.trim(), season: season.trim() })
      .select()
      .single()

    if (err) {
      setError(err.message)
      setSaving(false)
      return
    }
    onCreated(data as League)
  }

  return (
    <div className="rounded-xl border p-6 bg-surface border-border">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center">
          <Trophy size={20} className="text-amber-400" />
        </div>
        <div>
          <h2 className="font-semibold">Nieuwe poule aanmaken</h2>
          <p className="text-xs text-text-muted">Vul de competitiegegevens in</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5 text-text-muted">Poulenaam</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="bijv. Heren 30+ Hoofdklasse"
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none bg-surface-2 text-text"
            style={{ border: '1px solid var(--color-border)' }}
            required
          />
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5 text-text-muted">Seizoen</label>
          <input
            type="text"
            value={season}
            onChange={(e) => setSeason(e.target.value)}
            placeholder="2025-2026"
            className="w-full px-3 py-2.5 rounded-lg text-sm outline-none bg-surface-2 text-text"
            style={{ border: '1px solid var(--color-border)' }}
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="w-full py-3 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-50 bg-secondary text-secondary-text"
        >
          {saving ? 'Aanmaken...' : 'Poule aanmaken'}
        </button>
      </form>
    </div>
  )
}

// --- Add team form with autocomplete ---
interface AddTeamFormProps {
  leagueId: string
  onAdded: () => void
}

function AddTeamForm({ leagueId, onAdded }: AddTeamFormProps): React.JSX.Element {
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<ClubRegistryRow[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [selectedClub, setSelectedClub] = useState<ClubRegistryRow | null>(null)
  const [isNewClub, setIsNewClub] = useState(false)
  const [newClubName, setNewClubName] = useState('')
  const [newClubAddress, setNewClubAddress] = useState('')
  const [teamSuffix, setTeamSuffix] = useState('')
  const [isOwnTeam, setIsOwnTeam] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const debouncedQuery = useDebounce(searchQuery, 300)

  useEffect(() => {
    if (debouncedQuery.length < 2) {
      setSearchResults([])
      setShowDropdown(false)
      return
    }
    searchClubs(debouncedQuery)
  }, [debouncedQuery])

  async function searchClubs(q: string): Promise<void> {
    const { data } = await supabase
      .from('clubs_registry')
      .select('*')
      .ilike('name', `%${q}%`)
      .limit(8)
    setSearchResults((data as ClubRegistryRow[]) || [])
    setShowDropdown(true)
  }

  function selectClub(club: ClubRegistryRow): void {
    setSelectedClub(club)
    setSearchQuery(club.name)
    setIsNewClub(false)
    setShowDropdown(false)
    setNewClubName('')
    setNewClubAddress('')
  }

  function selectNewClub(): void {
    setSelectedClub(null)
    setIsNewClub(true)
    setNewClubName(searchQuery)
    setShowDropdown(false)
  }

  function clearSelection(): void {
    setSelectedClub(null)
    setIsNewClub(false)
    setSearchQuery('')
    setTeamSuffix('')
    setIsOwnTeam(false)
    setNewClubName('')
    setNewClubAddress('')
    searchRef.current?.focus()
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault()
    setSaving(true)
    setError('')

    try {
      const registryId: string | null = selectedClub?.id || null
      const clubName = selectedClub?.name || newClubName.trim()

      if (!clubName) {
        setError('Voer een clubnaam in')
        setSaving(false)
        return
      }

      const teamName = teamSuffix.trim() ? `${clubName} ${teamSuffix.trim()}` : clubName

      const { error: insertErr } = await supabase
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
      setError('Fout: ' + (err as Error).message)
      setSaving(false)
    }
  }

  const showForm = selectedClub !== null || isNewClub

  return (
    <div className="rounded-xl border p-4 bg-surface border-border">
      <h3 className="font-semibold text-sm mb-3">Teams toevoegen</h3>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* Search / club name input */}
        {!showForm ? (
          <div className="relative">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => searchQuery.length >= 2 && setShowDropdown(true)}
                placeholder="Zoek club (bijv. HC Leiden)"
                className="w-full pl-9 pr-3 py-2.5 rounded-lg text-sm outline-none bg-surface-2 text-text"
                style={{ border: '1px solid var(--color-border)' }}
              />
            </div>

            {showDropdown && (
              <div
                ref={dropdownRef}
                className="absolute top-full left-0 right-0 mt-1 rounded-lg border shadow-xl z-20 overflow-hidden bg-surface border-border"
              >
                {searchResults.length > 0 ? (
                  <>
                    {searchResults.map((club) => (
                      <button
                        key={club.id}
                        type="button"
                        onClick={() => selectClub(club)}
                        className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors border-b last:border-0 flex items-start gap-2 border-border"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{club.name}</p>
                          {club.address && (
                            <p className="text-xs truncate text-text-muted">{club.address}</p>
                          )}
                        </div>
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={selectNewClub}
                      className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center gap-2 text-text-muted"
                    >
                      <PlusCircle size={14} />
                      <span className="text-sm">Toevoegen als nieuwe club: "{searchQuery}"</span>
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={selectNewClub}
                    className="w-full text-left px-4 py-3 hover:bg-white/5 transition-colors flex items-center gap-2 text-text-muted"
                  >
                    <PlusCircle size={14} />
                    <span className="text-sm">Nieuwe club toevoegen: "{searchQuery}"</span>
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-surface-2 border-border">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">
                {selectedClub ? selectedClub.name : newClubName || searchQuery}
              </p>
              {selectedClub?.address && (
                <p className="text-xs flex items-center gap-1 mt-0.5 text-text-muted">
                  <MapPin size={10} />
                  {selectedClub.address}
                </p>
              )}
              {isNewClub && <span className="text-xs text-amber-400">Nieuwe club</span>}
            </div>
            <button type="button" onClick={clearSelection}>
              <X size={16} className="text-text-muted" />
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
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none bg-surface-2 text-text"
              style={{ border: '1px solid var(--color-border)' }}
              required
            />
            <input
              type="text"
              value={newClubAddress}
              onChange={(e) => setNewClubAddress(e.target.value)}
              placeholder="Adres (optioneel)"
              className="w-full px-3 py-2.5 rounded-lg text-sm outline-none bg-surface-2 text-text"
              style={{ border: '1px solid var(--color-border)' }}
            />
          </div>
        )}

        {/* Team suffix + own team checkbox + submit */}
        {showForm && (
          <>
            <div>
              <label className="block text-xs mb-1.5 text-text-muted">
                Team suffix <span className="text-text-muted">(optioneel, bijv. H30-1)</span>
              </label>
              <input
                type="text"
                value={teamSuffix}
                onChange={(e) => setTeamSuffix(e.target.value)}
                placeholder="bijv. H30-1"
                className="w-full px-3 py-2.5 rounded-lg text-sm outline-none bg-surface-2 text-text"
                style={{ border: '1px solid var(--color-border)' }}
              />
              {teamSuffix && (
                <p className="text-xs mt-1 text-amber-400">
                  Teamnaam: {selectedClub?.name || newClubName || searchQuery} {teamSuffix}
                </p>
              )}
            </div>

            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() => setIsOwnTeam(!isOwnTeam)}
                className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 transition-colors border-border ${isOwnTeam ? '' : 'border'}`}
                style={{ backgroundColor: isOwnTeam ? 'var(--color-secondary)' : 'transparent' }}
              >
                {isOwnTeam && <Check size={12} color="#0f172a" strokeWidth={3} />}
              </div>
              <span className="text-sm">Dit is ons eigen team</span>
            </label>

            {error && <p className="text-sm text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-lg font-semibold text-sm transition-opacity disabled:opacity-50 bg-secondary text-secondary-text"
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
interface TeamsListProps {
  teams: LeagueTeam[]
  totalSlots: number | null
  onDelete: (teamId: string) => Promise<void>
}

function TeamsList({ teams, totalSlots, onDelete }: TeamsListProps): React.JSX.Element {
  if (teams.length === 0) {
    return (
      <div className="rounded-xl border p-6 text-center bg-surface border-border">
        <p className="text-sm text-text-muted">Nog geen teams toegevoegd</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border overflow-hidden bg-surface border-border">
      <div className="px-4 py-3 border-b flex items-center justify-between border-border">
        <h3 className="font-semibold text-sm">Teams in deze poule</h3>
        <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-text-muted">
          {teams.length}{totalSlots ? ` van ${totalSlots}` : ''} teams
        </span>
      </div>

      <div className="divide-y divide-border">
        {teams.map((team) => (
          <div key={team.id} className="flex items-center gap-3 px-4 py-3">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${team.is_own_team ? 'bg-amber-400' : 'bg-slate-600'}`} />
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${team.is_own_team ? 'text-amber-400' : ''}`}>
                {team.team_name}
              </p>
              {team.is_own_team && <p className="text-xs text-text-muted">Eigen team</p>}
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
interface TravelTimeCalcProps {
  teamId: string | undefined
}

function TravelTimeCalc({ teamId }: TravelTimeCalcProps): React.JSX.Element {
  const [running, setRunning] = useState(false)
  const [done, setDone] = useState(false)
  const [log, setLog] = useState<(string | LogLine)[]>([])
  const [progress, setProgress] = useState({ current: 0, total: 0 })

  async function calculate(): Promise<void> {
    setRunning(true)
    setDone(false)
    setLog([])
    setProgress({ current: 0, total: 0 })
    const lines: (string | LogLine)[] = []

    // 1. Haal thuislocatie op via clubs_registry
    const { data: team } = await supabase
      .from('teams')
      .select('clubs(registry_id, clubs_registry(latitude, longitude, street_address, postcode, city, address))')
      .eq('id', teamId!)
      .single()

    let homeLat: number | null = null
    let homeLng: number | null = null
    const reg = (team as unknown as { clubs?: { clubs_registry?: { latitude?: number | null; longitude?: number | null; street_address?: string | null; postcode?: string | null; city?: string | null; address?: string | null } | null; registry_id?: string | null } | null })?.clubs?.clubs_registry

    if (reg) {
      homeLat = reg.latitude ?? null
      homeLng = reg.longitude ?? null
      if (!homeLat) {
        const fullAddress = [reg.street_address, reg.postcode, reg.city].filter(Boolean).join(' ') || reg.address || ''
        if (fullAddress) {
          const coords = await geocodeAddress(fullAddress)
          if (coords) {
            homeLat = coords.lat; homeLng = coords.lng
            const registryId = (team as unknown as { clubs?: { registry_id?: string | null } | null })?.clubs?.registry_id
            if (registryId) {
              await supabase.from('clubs_registry').update({ latitude: homeLat, longitude: homeLng }).eq('id', registryId)
            }
          }
        }
      }
    }

    if (!homeLat) {
      setLog(['Thuisclub niet gekoppeld aan clubs_registry. Controleer de club via Supabase.'])
      setRunning(false)
      return
    }

    // 2. Alle uitwedstrijden met league_match_id ophalen
    const { data: awayMatches } = await supabase
      .from('matches')
      .select('id, opponent, league_match_id')
      .eq('team_id', teamId!)
      .eq('is_home', false)
      .not('league_match_id', 'is', null)

    if (!awayMatches?.length) {
      setLog([{ text: 'Geen uitwedstrijden met competitiekoppeling gevonden.', ok: false }])
      setRunning(false)
      setDone(true)
      return
    }

    setProgress({ current: 0, total: awayMatches.length })

    // 3. Locatiedata per league_match ophalen
    const { data: leagueMatches } = await supabase
      .from('league_matches')
      .select('id, league_teams!home_team_id(registry_id, team_name, clubs_registry(latitude, longitude, street_address, postcode, city, address))')
      .in('id', awayMatches.map(m => m.league_match_id!))

    const lmMap: Record<string, unknown> = {}
    for (const lm of leagueMatches || []) lmMap[(lm as { id: string }).id] = lm

    // 4. Reistijd berekenen per wedstrijd
    for (const match of awayMatches) {
      const lm = lmMap[match.league_match_id!] as { league_teams?: { clubs_registry?: { latitude?: number | null; longitude?: number | null; street_address?: string | null; postcode?: string | null; city?: string | null; address?: string | null } | null; registry_id?: string | null } | null } | undefined
      const regTo = lm?.league_teams?.clubs_registry
      let toLat: number | null = regTo?.latitude ?? null
      let toLng: number | null = regTo?.longitude ?? null

      if (!toLat && regTo) {
        const fullAddress = [regTo.street_address, regTo.postcode, regTo.city].filter(Boolean).join(' ') || regTo.address || ''
        if (fullAddress) {
          const coords = await geocodeAddress(fullAddress)
          if (coords) {
            toLat = coords.lat; toLng = coords.lng
            const regId = lm?.league_teams?.registry_id
            if (regId && regTo.latitude === null) {
              await supabase.from('clubs_registry').update({ latitude: toLat, longitude: toLng }).eq('id', regId)
            }
          }
        }
      }

      if (!toLat) {
        lines.push({ text: `${match.opponent}: geen adres bekend`, ok: false })
        setProgress(p => ({ ...p, current: p.current + 1 }))
        continue
      }

      const minutes = await getTravelDuration(homeLat!, homeLng!, toLat, toLng!)
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
      setProgress(p => ({ ...p, current: p.current + 1 }))
    }

    const saved = (lines.filter(l => typeof l !== 'string' && l.ok) as LogLine[]).length
    lines.push({ text: `Klaar. ${saved}/${lines.length} opgeslagen. Verzameltijden worden bijgewerkt zodra je teruggaat.`, ok: null })
    setLog(lines)
    setRunning(false)
    setDone(true)
  }

  return (
    <div className="rounded-xl border p-4 space-y-3 bg-surface border-border">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">Reistijden berekenen</p>
          <p className="text-xs mt-0.5 text-text-muted">
            Berekent en overschrijft reistijden voor alle uitwedstrijden
          </p>
        </div>
        <button
          onClick={calculate}
          disabled={running}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold disabled:opacity-50 transition-colors bg-secondary text-secondary-text"
        >
          <Car size={14} />
          {running ? 'Bezig...' : 'Bereken'}
        </button>
      </div>

      {running && progress.total > 0 && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-text-muted">
            <span>{progress.current}/{progress.total} berekend</span>
            <span>{Math.round(progress.current / progress.total * 100)}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden bg-surface-2">
            <div
              className="h-full rounded-full transition-all duration-300 bg-secondary"
              style={{ width: `${progress.current / progress.total * 100}%` }}
            />
          </div>
        </div>
      )}

      {log.length > 0 && (
        <div className="rounded-lg p-2 text-xs space-y-0.5" style={{ backgroundColor: '#0f172a' }}>
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
export default function AdminLeague(): React.JSX.Element {
  const { activeTeam } = useTeamStore()
  const queryClient = useQueryClient()

  const { data, isLoading } = useQuery<LeagueQueryData>({
    queryKey: ['adminLeague', activeTeam?.id],
    queryFn: async (): Promise<LeagueQueryData> => {
      const { data: leagueData } = await supabase
        .from('leagues')
        .select('*')
        .eq('team_id', activeTeam!.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (!leagueData) return { league: null, teams: [] }

      const { data: teamsData } = await supabase
        .from('league_teams')
        .select('*')
        .eq('league_id', leagueData.id)
        .order('created_at', { ascending: true })

      return { league: leagueData as League, teams: (teamsData as LeagueTeam[]) || [] }
    },
    enabled: !!activeTeam?.id,
  })

  const league = data?.league || null
  const teams = data?.teams || []

  const deleteTeamMutation = useMutation<void, Error, string>({
    mutationFn: async (teamId: string): Promise<void> => {
      await supabase.from('league_teams').delete().eq('id', teamId)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminLeague', activeTeam?.id] })
    },
  })

  async function handleDelete(teamId: string): Promise<void> {
    await deleteTeamMutation.mutateAsync(teamId)
  }

  function handleLeagueCreated(_newLeague: League): void {
    queryClient.invalidateQueries({ queryKey: ['adminLeague', activeTeam?.id] })
  }

  function handleTeamAdded(): void {
    queryClient.invalidateQueries({ queryKey: ['adminLeague', activeTeam?.id] })
  }

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-3 pt-2 mb-6">
          <Link to="/admin" className="text-text-muted">
            <ArrowLeft size={20} />
          </Link>
          <h1 className="text-2xl font-bold">Competitie</h1>
        </div>
        <PageLoader />
      </div>
    )
  }

  return (
    <div className="p-4 pb-8 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-text-muted hover:text-slate-200">
          <ArrowLeft size={20} />
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">Competitie</h1>
          {league && (
            <p className="text-sm truncate text-text-muted">
              {league.name} · {league.season}
            </p>
          )}
        </div>
        {league && (
          <Link
            to="/admin/league/matches"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium text-text-muted bg-surface"
            style={{ border: '1px solid var(--color-border)' }}
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
              className="flex items-center gap-3 p-3 rounded-xl border transition-colors hover:border-slate-500 bg-surface border-border"
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-purple-400 text-sm">📅</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Wedstrijden invoeren</p>
                <p className="text-xs truncate text-text-muted">Programma</p>
              </div>
            </Link>
            <Link
              to="/admin/league/results"
              className="flex items-center gap-3 p-3 rounded-xl border transition-colors hover:border-slate-500 bg-surface border-border"
            >
              <div className="w-8 h-8 rounded-lg bg-pink-500/20 flex items-center justify-center flex-shrink-0">
                <span className="text-pink-400 text-sm">🏆</span>
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Uitslagen invoeren</p>
                <p className="text-xs truncate text-text-muted">Resultaten</p>
              </div>
            </Link>
          </div>

          {/* Travel time calculator */}
          <TravelTimeCalc teamId={activeTeam?.id} />

          {/* Add team form */}
          <AddTeamForm leagueId={league.id} onAdded={handleTeamAdded} />

          {/* Teams list */}
          <TeamsList teams={teams} totalSlots={null} onDelete={handleDelete} />
        </>
      )}
    </div>
  )
}
