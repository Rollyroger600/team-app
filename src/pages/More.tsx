import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Settings, ChevronDown, ChevronUp, ShieldCheck, Flag, ChevronRight, Dumbbell } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import PageLoader from '../components/ui/PageLoader'
import EmptyState from '../components/ui/EmptyState'
import { UmpireCard, groupDuties } from '../components/ui/UmpireCard'
import TeamAvailabilityList from '../components/ui/TeamAvailabilityList'
import { supabase } from '../lib/supabase'
import useAuthStore from '../stores/useAuthStore'
import useTeamStore from '../stores/useTeamStore'
import { useIsTeamAdmin } from '../lib/permissions'
import { useTrainings, formatTrainingDate, formatTime as formatTrainingTime, type Training } from '../lib/trainings'
import { statusLabelFor, statusDot } from '../lib/availability'
import KittyPanel from '../components/ui/KittyPanel'
import { useRealtimeInvalidate } from '../lib/realtime'
import { formatDate, formatTime } from '../lib/utils'
import { useOpponentName } from '../lib/opponents'
import { PLAYER_STATUSES } from '../lib/availability'
import type { AvailabilityStatus, UmpireDutyWithJoins, UmpireGroup } from '../types/app'

interface MatchItem {
  id: string
  opponent: string
  match_date: string
  match_time: string | null
  is_home: boolean
  status: string | null
}

interface MemberItem {
  id: string
  name: string
}

interface AvailPlayer {
  player_id: string
  status: string
}

interface MoreData {
  matches: MatchItem[]
  members: MemberItem[]
  myAvailMap: Record<string, string>
  allAvailMap: Record<string, AvailPlayer[]>
  myOverriddenMap: Record<string, boolean>
}

interface TrainingAttendance {
  training_id: string
  player_id: string
  status: string
}

interface UmpireData {
  upcoming: UmpireGroup[]
  past: UmpireGroup[]
}

export default function More() {
  const { user } = useAuthStore()
  const isAdmin = useIsTeamAdmin()
  const { activeTeam, teamSettings } = useTeamStore()
  const opponentName = useOpponentName()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState('beschikbaarheid')
  // 3-wegfilter binnen de Beschikbaarheid-tab, bewust geen vierde tab erbij:
  // More.tsx zit met drie pills op zijn plafond voor een telefoon.
  const [soort, setSoort] = useState<'alles' | 'wedstrijden' | 'trainingen'>('alles')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState<string | null>(null)
  const [myAvail, setMyAvail] = useState<Record<string, string | null>>({})
  const [allAvail, setAllAvail] = useState<Record<string, AvailPlayer[]>>({})

  useRealtimeInvalidate('match_availability', ['moreAvailability', activeTeam?.id], !!activeTeam?.id)

  const { data, isLoading } = useQuery<MoreData>({
    queryKey: ['moreAvailability', activeTeam?.id],
    queryFn: async (): Promise<MoreData> => {
      // No date filter here: availability must stay visible and editable for the
      // whole season, not just upcoming matches — split into upcoming/past below.
      const [matchRes, membersRes] = await Promise.all([
        supabase
          .from('matches')
          .select('id, opponent, match_date, match_time, is_home, status')
          .eq('team_id', activeTeam!.id)
          .order('match_date', { ascending: true }),
        supabase
          .from('team_memberships')
          .select('player_id, profiles(full_name, nickname)')
          .eq('team_id', activeTeam!.id)
          .eq('active', true),
      ])

      const matchList = (matchRes.data || []) as unknown as MatchItem[]
      const memberList: MemberItem[] = (membersRes.data || []).map(m => ({
        id: m.player_id,
        name: (m.profiles as { nickname?: string | null; full_name?: string | null } | null)?.nickname
          || (m.profiles as { full_name?: string | null } | null)?.full_name?.split(' ')[0]
          || '?',
      }))

      let myAvailMap: Record<string, string> = {}
      let allAvailMap: Record<string, AvailPlayer[]> = {}

      let myOverriddenMap: Record<string, boolean> = {}

      if (matchList.length > 0) {
        const [myAvRes, allAvRes] = await Promise.all([
          supabase
            .from('match_availability')
            .select('match_id, status, overridden')
            .eq('player_id', user!.id),
          supabase
            .from('match_availability')
            .select('match_id, player_id, status')
            .in('match_id', matchList.map(m => m.id)),
        ])

        for (const a of (myAvRes.data || []) as { match_id: string; status: string; overridden?: boolean }[]) {
          myAvailMap[a.match_id] = a.status
          if (a.overridden) myOverriddenMap[a.match_id] = true
        }

        for (const a of (allAvRes.data || [])) {
          if (!allAvailMap[a.match_id]) allAvailMap[a.match_id] = []
          allAvailMap[a.match_id].push({ player_id: a.player_id, status: a.status })
        }
      }

      return { matches: matchList, members: memberList, myAvailMap, allAvailMap, myOverriddenMap }
    },
    enabled: !!activeTeam?.id && !!user?.id,
  })

  // Sync availability from server (after invalidation)
  useEffect(() => {
    if (data) {
      setMyAvail(data.myAvailMap)
      setAllAvail(data.allAvailMap)
    }
  }, [data])

  const matches = data?.matches || []
  const members = data?.members || []

  const today = new Date().toISOString().split('T')[0]
  const upcomingMatches = matches.filter(m => m.match_date >= today)
  const pastMatches = matches.filter(m => m.match_date < today).slice().reverse()

  // Trainingen: query is gegate op de toggle, niet alleen de render — anders haalt
  // elk team zonder trainingen alsnog een lege lijst op.
  const { data: trainings = [] } = useTrainings(activeTeam?.id, teamSettings.trainingen_enabled)
  const { data: trainingAvail = {} } = useQuery<Record<string, TrainingAttendance[]>>({
    queryKey: ['moreTrainingAttendance', activeTeam?.id],
    queryFn: async () => {
      const ids = trainings.map(t => t.id)
      if (ids.length === 0) return {}
      const { data } = await supabase
        .from('training_attendance')
        .select('training_id, player_id, status')
        .in('training_id', ids)
      const map: Record<string, TrainingAttendance[]> = {}
      for (const r of (data || []) as unknown as TrainingAttendance[]) {
        if (!map[r.training_id]) map[r.training_id] = []
        map[r.training_id].push(r)
      }
      return map
    },
    enabled: !!activeTeam?.id && teamSettings.trainingen_enabled && trainings.length > 0,
  })

  const upcomingTrainings = trainings.filter(t => t.training_date >= today)
  const pastTrainings = trainings.filter(t => t.training_date < today).slice().reverse()

  /** Wedstrijden en trainingen in één lijst, op datum. Het filter bepaalt wat
   *  meedoet; bij 'alles' lopen ze door elkaar zoals ze in de agenda staan. */
  function gecombineerd(
    m: MatchItem[],
    t: Training[],
    aflopend: boolean,
  ): Array<{ kind: 'match'; item: MatchItem } | { kind: 'training'; item: Training }> {
    const uit: Array<{ kind: 'match'; item: MatchItem } | { kind: 'training'; item: Training }> = []
    if (soort !== 'trainingen') for (const x of m) uit.push({ kind: 'match', item: x })
    if (soort !== 'wedstrijden') for (const x of t) uit.push({ kind: 'training', item: x })
    const datum = (e: typeof uit[number]) => e.kind === 'match' ? e.item.match_date : e.item.training_date
    uit.sort((a, b) => aflopend ? datum(b).localeCompare(datum(a)) : datum(a).localeCompare(datum(b)))
    return uit
  }

  const komend = gecombineerd(upcomingMatches, upcomingTrainings, false)
  const geweest = gecombineerd(pastMatches, pastTrainings, true)

  async function setTrainingStatus(trainingId: string, status: string) {
    if (!user) return
    setSaving(trainingId + status)
    setMyAvail(prev => ({ ...prev, [trainingId]: status }))
    await supabase.from('training_attendance').upsert({
      training_id: trainingId,
      player_id: user.id,
      status,
      responded_at: new Date().toISOString(),
    }, { onConflict: 'training_id,player_id' })
    queryClient.invalidateQueries({ queryKey: ['moreTrainingAttendance', activeTeam?.id] })
    setSaving(null)
  }

  // Umpire duties query
  const { data: umpireData, isLoading: umpireLoading } = useQuery<UmpireData>({
    queryKey: ['umpire', activeTeam?.id],
    queryFn: async (): Promise<UmpireData> => {
      const { data: duties } = await supabase
        .from('umpire_duties')
        .select('id, match_id, player_id, umpire_match_desc, notes, status, profiles(full_name, nickname), matches(match_date, opponent, is_home)')
        .eq('team_id', activeTeam!.id)
        .order('created_at', { ascending: true })

      const today = new Date().toISOString().split('T')[0]
      return groupDuties((duties as unknown as UmpireDutyWithJoins[]) || [], today, teamSettings)
    },
    enabled: !!activeTeam?.id && !!user?.id && teamSettings.fluitbeurten_enabled,
  })

  const umpireUpcoming = umpireData?.upcoming || []
  const umpirePast = umpireData?.past || []

  const availMutation = useMutation<void, Error, { matchId: string; next: AvailabilityStatus | null }>({
    mutationFn: async ({ matchId, next }) => {
      if (next) {
        await supabase.from('match_availability').upsert(
          { match_id: matchId, player_id: user!.id, status: next, responded_at: new Date().toISOString() },
          { onConflict: 'match_id,player_id' }
        )
      } else {
        await supabase.from('match_availability')
          .delete()
          .eq('match_id', matchId)
          .eq('player_id', user!.id)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['moreAvailability', activeTeam?.id] })
    },
  })

  async function setStatus(matchId: string, status: AvailabilityStatus) {
    const current = myAvail[matchId]
    const next: AvailabilityStatus | null = current === status ? null : status

    setSaving(matchId + status)
    setMyAvail(prev => ({ ...prev, [matchId]: next }))

    // Update allAvail ook lokaal
    setAllAvail(prev => {
      const list = (prev[matchId] || []).filter(a => a.player_id !== user!.id)
      if (next) list.push({ player_id: user!.id, status: next })
      return { ...prev, [matchId]: list }
    })

    await availMutation.mutateAsync({ matchId, next })
    setSaving(null)
  }

  function toggleExpand(matchId: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(matchId) ? next.delete(matchId) : next.add(matchId)
      return next
    })
  }

  function renderMatchRow(match: MatchItem, isLast: boolean) {
    const myStatus = myAvail[match.id] || null
    const myOverridden = data?.myOverriddenMap?.[match.id] === true
    const isSaving = saving?.startsWith(match.id)
    const isExpanded = expanded.has(match.id)
    const matchAvail = allAvail[match.id] || []
    const availCount = matchAvail.filter(a => a.status === 'available').length
    const totalMembers = members.length

    // Bouw ledenlijst met status
    const memberAvailMap: Record<string, string> = {}
    for (const a of matchAvail) memberAvailMap[a.player_id] = a.status

    return (
      <div key={match.id} className={`${isLast ? '' : 'border-b'} border-border`}>
        {/* Hoofdrij */}
        <div className="flex items-center gap-3 px-4 py-3">
          {/* Deze lijst is de enige plek die élke wedstrijd van het seizoen toont,
              inclusief losse/oefenwedstrijden zonder poulekoppeling (Wedstrijden ->
              Overzicht/Programma/Uitslagen zijn allemaal opgebouwd uit league_matches
              en filteren die er dus stil uit). Vandaar de link naar wedstrijddetail
              hier, zodat een admin een losse wedstrijd ook echt kan terugvinden om te
              bewerken of te verwijderen. */}
          <Link to={`/matches/${match.id}`} className="flex-1 min-w-0 group">
            <p className="text-xs text-text-muted">{formatDate(match.match_date)} • {formatTime(match.match_time)}</p>
            <p className="font-medium text-sm truncate group-hover:text-secondary-soft transition-colors">
              {match.is_home ? 'Thuis' : 'Uit'} vs {opponentName(match.opponent)}
            </p>
            {myOverridden && (
              <p className="text-xs text-secondary-soft mt-0.5">Aangepast door admin</p>
            )}
          </Link>
          <ChevronRight size={16} className="flex-shrink-0 text-text-faint" />

          {/* Snelle knoppen */}
          <div className="flex gap-1.5 flex-shrink-0">
            {PLAYER_STATUSES.map(({ status, icon: Icon, label, active }) => {
              const isActive = myStatus === status
              return (
                <button
                  key={status}
                  onClick={() => !isSaving && setStatus(match.id, status)}
                  disabled={!!saving}
                  title={label}
                  className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                    isActive ? active : 'border-border text-text-subtle hover:border-border-hover'
                  }`}
                >
                  <Icon size={15} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Uitklap-balk */}
        <button
          onClick={() => toggleExpand(match.id)}
          className="w-full flex items-center justify-between px-4 pb-2.5 text-xs transition-colors hover:text-text-soft text-text-muted"
        >
          <span>
            <span className={availCount >= 11 ? 'text-success font-semibold' : availCount >= 8 ? 'text-secondary-soft font-semibold' : 'text-danger font-semibold'}>
              {availCount}
            </span>
            /{totalMembers} beschikbaar
          </span>
          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {/* Uitgeklaptelijst */}
        {isExpanded && (
          <div className="border-t mx-4 mb-3 pt-2 border-border">
            <TeamAvailabilityList
              matchId={match.id}
              members={members}
              statusMap={memberAvailMap}
              onChanged={() => {
                queryClient.invalidateQueries({ queryKey: ['moreAvailability', activeTeam?.id] })
              }}
            />
          </div>
        )}
      </div>
    )
  }

  function renderTrainingRow(t: Training, isLast: boolean) {
    const rows = trainingAvail[t.id] || []
    const myStatus = myAvail[t.id] ?? rows.find(r => r.player_id === user?.id)?.status ?? null
    const isSaving = saving?.startsWith(t.id)
    const isExpanded = expanded.has(t.id)
    const aanwezig = rows.filter(r => r.status === 'available').length
    const afgelast = t.status === 'cancelled'

    return (
      <div key={t.id} className={`${isLast ? '' : 'border-b'} border-border`}>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-text-muted flex items-center gap-1">
              <Dumbbell size={11} /> Training • {formatTrainingTime(t.start_time)}
            </p>
            <p className={`font-medium text-sm truncate ${afgelast ? 'line-through text-text-muted' : ''}`}>
              {formatTrainingDate(t.training_date)}
              {t.location && <span className="text-text-subtle font-normal"> · {t.location}</span>}
            </p>
            {afgelast && <p className="text-xs text-danger mt-0.5">Afgelast</p>}
          </div>

          {!afgelast && (
            <div className="flex gap-1.5 flex-shrink-0">
              {PLAYER_STATUSES.map(({ status, icon: Icon, active }) => {
                const isActive = myStatus === status
                return (
                  <button
                    key={status}
                    onClick={() => !isSaving && setTrainingStatus(t.id, status)}
                    disabled={!!saving}
                    title={statusLabelFor(status, 'training')}
                    className={`w-8 h-8 rounded-lg border flex items-center justify-center transition-all ${
                      isActive ? active : 'border-border text-text-subtle hover:border-border-hover'
                    }`}
                  >
                    <Icon size={15} />
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <button
          onClick={() => toggleExpand(t.id)}
          className="w-full flex items-center justify-between px-4 pb-2.5 text-xs transition-colors hover:text-text-soft text-text-muted"
        >
          <span>
            <span className="text-success font-semibold">{aanwezig}</span>
            /{members.length} aanwezig
          </span>
          {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>

        {isExpanded && (
          <div className="border-t mx-4 mb-3 pt-2 border-border space-y-1">
            {members.map(m => {
              const st = rows.find(r => r.player_id === m.id)?.status
              return (
                <div key={m.id} className="flex items-center gap-2 text-xs py-1">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${statusDot(st)}`} />
                  <span className="flex-1 truncate">{m.name}</span>
                  <span className="text-text-subtle">{statusLabelFor(st, 'training', 'Nog niet')}</span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between pt-2">
        <h1 className="text-2xl font-bold">Meer</h1>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <Link to="/admin"
              className="w-9 h-9 rounded-xl border flex items-center justify-center transition-colors hover:border-secondary/40 hover:text-secondary-soft border-border text-text-muted"
              title="Admin"
            >
              <ShieldCheck size={16} />
            </Link>
          )}
          <Link to="/settings"
            className="w-9 h-9 rounded-xl border flex items-center justify-center transition-colors hover:border-border-hover border-border text-text-muted"
            title="Instellingen"
          >
            <Settings size={16} />
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-1 rounded-xl bg-surface">
        {[
          { key: 'beschikbaarheid', label: 'Beschikbaarheid' },
          ...(teamSettings.fluitbeurten_enabled ? [{ key: 'fluitbeurten', label: 'Fluitbeurten' }] : []),
          ...(teamSettings.kitty_enabled ? [{ key: 'kitty', label: teamSettings.kitty_name }] : []),
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === t.key ? 'bg-primary text-primary-text' : 'text-text-muted hover:text-text'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Beschikbaarheid tab */}
      {tab === 'beschikbaarheid' && (isLoading ? (
        <PageLoader />
      ) : matches.length === 0 && trainings.length === 0 ? (
        <div className="rounded-xl p-8 border text-center bg-surface border-border">
          <p className="text-text-muted">Geen wedstrijden of trainingen gevonden</p>
        </div>
      ) : (
        <div className="space-y-2">
          {/* 3-wegfilter, alleen zinvol als er ook trainingen zijn */}
          {teamSettings.trainingen_enabled && (
            <div className="flex gap-1 p-1 rounded-xl bg-surface">
              {([
                { key: 'alles', label: 'Alles' },
                { key: 'wedstrijden', label: 'Wedstrijden' },
                { key: 'trainingen', label: 'Trainingen' },
              ] as const).map(f => (
                <button
                  key={f.key}
                  onClick={() => setSoort(f.key)}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    soort === f.key ? 'bg-secondary text-secondary-text' : 'text-text-muted hover:text-text'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}

          {komend.length === 0 ? (
            <div className="rounded-xl p-8 border text-center bg-surface border-border">
              <p className="text-text-muted">Niets aankomends</p>
            </div>
          ) : (
            <div className="rounded-xl border overflow-hidden bg-surface border-border">
              {komend.map((e, i) => e.kind === 'match'
                ? renderMatchRow(e.item, i === komend.length - 1)
                : renderTrainingRow(e.item, i === komend.length - 1))}
            </div>
          )}

          {geweest.length > 0 && (
            <>
              <p className="text-xs font-semibold text-text-subtle uppercase tracking-wide px-1 pt-2">Al geweest</p>
              <div className="rounded-xl border overflow-hidden bg-surface border-border">
                {geweest.map((e, i) => e.kind === 'match'
                  ? renderMatchRow(e.item, i === geweest.length - 1)
                  : renderTrainingRow(e.item, i === geweest.length - 1))}
              </div>
            </>
          )}
        </div>
      ))}

      {/* Teamkas tab */}
      {tab === 'kitty' && activeTeam && (
        <KittyPanel
          teamId={activeTeam.id}
          kittyName={teamSettings.kitty_name}
          expectedCents={teamSettings.kitty_expected_cents}
          currentUserId={user?.id}
        />
      )}

      {/* Fluitbeurten tab */}
      {tab === 'fluitbeurten' && (umpireLoading ? (
        <PageLoader />
      ) : umpireUpcoming.length === 0 && umpirePast.length === 0 ? (
        <EmptyState icon={Flag}>Geen fluitbeurten gepland</EmptyState>
      ) : (
        <div className="space-y-2">
          {umpireUpcoming.map((group, i) => (
            <UmpireCard key={group.match?.id || i} group={group} userId={user!.id} past={false} />
          ))}
          {umpirePast.length > 0 && (
            <>
              <p className="text-xs font-semibold text-text-subtle uppercase tracking-wide px-1 pt-2">Gefloten</p>
              {umpirePast.map((group, i) => (
                <UmpireCard key={group.match?.id || i} group={group} userId={user!.id} past={true} />
              ))}
            </>
          )}
        </div>
      ))}
    </div>
  )
}
