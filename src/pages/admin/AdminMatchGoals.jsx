import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2, Target, Square } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { formatDate, formatTime } from '../../lib/utils'

const CARD_COLORS = {
  yellow: { label: 'Geel', bg: 'bg-yellow-400/20 border-yellow-400/50 text-yellow-300' },
  red:    { label: 'Rood', bg: 'bg-red-500/20 border-red-500/50 text-red-400' },
}

function displayName(profile) {
  return profile?.nickname || profile?.full_name?.split(' ')[0] || '?'
}

export default function AdminMatchGoals() {
  const { id } = useParams()
  const [match, setMatch] = useState(null)
  const [roster, setRoster] = useState([])   // spelers in selectie
  const [goals, setGoals] = useState([])
  const [cards, setCards] = useState([])
  const [loading, setLoading] = useState(true)

  // Goal form state
  const [gForm, setGForm] = useState({ scorer_id: '', assist_id: '', minute: '', is_own_goal: false, is_penalty: false, is_penalty_corner: false })
  const [gSaving, setGSaving] = useState(false)

  // Card form state
  const [cForm, setCForm] = useState({ player_id: '', card_type: 'yellow', minute: '' })
  const [cSaving, setCSaving] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    const [matchRes, rosterRes, goalsRes, cardsRes] = await Promise.all([
      supabase.from('matches').select('*').eq('id', id).single(),
      supabase.from('match_roster')
        .select('player_id, profiles(full_name, nickname, jersey_number)')
        .eq('match_id', id),
      supabase.from('goals')
        .select('id, minute, is_own_goal, is_penalty, is_penalty_corner, scorer_id, assist_id, scorer:profiles!goals_scorer_id_fkey(full_name, nickname), assist:profiles!goals_assist_id_fkey(full_name, nickname)')
        .eq('match_id', id)
        .order('minute', { ascending: true, nullsFirst: false }),
      supabase.from('match_cards')
        .select('id, player_id, card_type, minute, profiles(full_name, nickname)')
        .eq('match_id', id)
        .order('minute', { ascending: true, nullsFirst: false }),
    ])
    setMatch(matchRes.data)

    // Als er geen selectie is voor deze wedstrijd, val terug op alle teamleden
    let players = rosterRes.data || []
    if (players.length === 0 && matchRes.data?.team_id) {
      const { data: members } = await supabase
        .from('team_memberships')
        .select('player_id, profiles(full_name, nickname, jersey_number)')
        .eq('team_id', matchRes.data.team_id)
        .eq('active', true)
      players = members || []
    }

    setRoster(players)
    setGoals(goalsRes.data || [])
    setCards(cardsRes.data || [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  async function addGoal(e) {
    e.preventDefault()
    if (!gForm.scorer_id && !gForm.is_own_goal) return
    setGSaving(true)
    await supabase.from('goals').insert({
      match_id: id,
      scorer_id: gForm.scorer_id || null,
      assist_id: gForm.assist_id || null,
      minute: gForm.minute ? parseInt(gForm.minute) : null,
      is_own_goal: gForm.is_own_goal,
      is_penalty: gForm.is_penalty,
      is_penalty_corner: gForm.is_penalty_corner,
    })
    setGForm({ scorer_id: '', assist_id: '', minute: '', is_own_goal: false, is_penalty: false, is_penalty_corner: false })
    setGSaving(false)
    load()
  }

  async function deleteGoal(goalId) {
    await supabase.from('goals').delete().eq('id', goalId)
    setGoals(prev => prev.filter(g => g.id !== goalId))
  }

  async function addCard(e) {
    e.preventDefault()
    if (!cForm.player_id) return
    setCSaving(true)
    await supabase.from('match_cards').insert({
      match_id: id,
      player_id: cForm.player_id,
      card_type: cForm.card_type,
      minute: cForm.minute ? parseInt(cForm.minute) : null,
    })
    setCForm({ player_id: '', card_type: 'yellow', minute: '' })
    setCSaving(false)
    load()
  }

  async function deleteCard(cardId) {
    await supabase.from('match_cards').delete().eq('id', cardId)
    setCards(prev => prev.filter(c => c.id !== cardId))
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin"
             style={{ borderColor: 'var(--color-secondary)' }} />
      </div>
    )
  }

  const selectClass = "flex-1 px-2.5 py-2 rounded-lg text-sm outline-none focus:border-amber-400"
  const selectStyle = { backgroundColor: 'var(--color-surface-2)', border: '1px solid var(--color-border)', color: 'var(--color-text)' }

  return (
    <div className="p-4 space-y-5 pb-8">
      <div className="flex items-center gap-3 pt-2">
        <Link to="/admin" className="text-slate-400 hover:text-slate-200">
          <ArrowLeft size={20} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold">Doelpunten & kaarten</h1>
          {match && (
            <p className="text-sm text-slate-400">
              vs {match.opponent} · {formatDate(match.match_date)}
            </p>
          )}
        </div>
      </div>

      {/* Scorebord samenvatting */}
      {match && (
        <div className="rounded-xl p-3 border text-center"
             style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <p className="text-3xl font-bold">
            {match.score_home ?? '–'} <span className="text-slate-500 text-xl">–</span> {match.score_away ?? '–'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {match.is_home ? `Ons team – ${match.opponent}` : `${match.opponent} – Ons team`}
          </p>
          {(() => {
            const ourScore = match.is_home ? match.score_home : match.score_away
            const registered = goals.length
            const complete = ourScore != null && registered >= ourScore
            return (
              <p className="text-xs mt-0.5" style={{ color: complete ? '#22c55e' : '#f59e0b' }}>
                {ourScore != null
                  ? `${registered}/${ourScore} doelpunten ingevoerd${complete ? ' ✓' : ''}`
                  : `${registered} doelpunten geregistreerd`}
              </p>
            )
          })()}
        </div>
      )}

      {/* Doelpunten */}
      <div className="space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Target size={16} className="text-amber-400" /> Doelpunten
        </h2>

        {goals.length > 0 && (
          <div className="rounded-xl border overflow-hidden"
               style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            {goals.map((g, i) => (
              <div key={g.id}
                   className={`flex items-center gap-3 px-4 py-2.5 ${i < goals.length - 1 ? 'border-b' : ''}`}
                   style={{ borderColor: 'var(--color-border)' }}>
                <span className="w-8 text-xs text-slate-500 text-center flex-shrink-0">
                  {g.minute ? `${g.minute}'` : '–'}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium">
                    {g.is_own_goal ? `${displayName(g.scorer)} (eigen)` : displayName(g.scorer)}
                  </span>
                  {g.assist?.full_name && (
                    <span className="text-xs text-slate-400 ml-2">assist: {displayName(g.assist)}</span>
                  )}
                  {g.is_penalty && <span className="text-xs text-amber-400 ml-2">strafbal</span>}
                  {g.is_penalty_corner && <span className="text-xs text-blue-400 ml-2">strafcorner</span>}
                </div>
                <button onClick={() => deleteGoal(g.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors p-1 flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Doelpunt toevoegen */}
        <form onSubmit={addGoal}
              className="rounded-xl border p-3 space-y-2"
              style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <div className="flex gap-2">
            <select value={gForm.scorer_id}
                    onChange={e => setGForm(p => ({ ...p, scorer_id: e.target.value }))}
                    className={selectClass} style={selectStyle}>
              <option value="">Schutter...</option>
              {roster.map(r => (
                <option key={r.player_id} value={r.player_id}>
                  {displayName(r.profiles)}
                </option>
              ))}
            </select>
            <input type="number" min="1" max="90"
                   value={gForm.minute}
                   onChange={e => setGForm(p => ({ ...p, minute: e.target.value }))}
                   placeholder="Min"
                   className="w-16 px-2 py-2 rounded-lg text-sm outline-none text-center"
                   style={selectStyle} />
          </div>

          <select value={gForm.assist_id}
                  onChange={e => setGForm(p => ({ ...p, assist_id: e.target.value }))}
                  className={selectClass} style={{ ...selectStyle, width: '100%' }}>
            <option value="">Assist (optioneel)...</option>
            {roster.map(r => (
              <option key={r.player_id} value={r.player_id}>
                {displayName(r.profiles)}
              </option>
            ))}
          </select>

          <div className="flex gap-3 text-sm flex-wrap">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={gForm.is_own_goal}
                     onChange={e => setGForm(p => ({ ...p, is_own_goal: e.target.checked }))}
                     className="accent-amber-400" />
              Eigen doelpunt
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={gForm.is_penalty}
                     onChange={e => setGForm(p => ({ ...p, is_penalty: e.target.checked }))}
                     className="accent-amber-400" />
              Strafbal
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={gForm.is_penalty_corner}
                     onChange={e => setGForm(p => ({ ...p, is_penalty_corner: e.target.checked }))}
                     className="accent-amber-400" />
              Strafcorner
            </label>
          </div>

          {(() => {
            const ourScore = match ? (match.is_home ? match.score_home : match.score_away) : null
            const atMax = ourScore != null && goals.length >= ourScore
            if (atMax) return (
              <p className="text-sm text-center py-1" style={{ color: '#22c55e' }}>
                Alle {ourScore} doelpunten ingevoerd ✓
              </p>
            )
            return (
              <button type="submit" disabled={gSaving || (!gForm.scorer_id && !gForm.is_own_goal)}
                      className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                      style={{ backgroundColor: 'var(--color-secondary)', color: 'var(--color-secondary-text)' }}>
                <Plus size={14} />
                {gSaving ? 'Opslaan...' : ourScore != null ? `Doelpunt toevoegen (${goals.length}/${ourScore})` : 'Doelpunt toevoegen'}
              </button>
            )
          })()}
        </form>
      </div>

      {/* Kaarten */}
      <div className="space-y-3">
        <h2 className="font-semibold flex items-center gap-2">
          <Square size={16} className="text-yellow-400" /> Kaarten
        </h2>

        {cards.length > 0 && (
          <div className="rounded-xl border overflow-hidden"
               style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
            {cards.map((c, i) => (
              <div key={c.id}
                   className={`flex items-center gap-3 px-4 py-2.5 ${i < cards.length - 1 ? 'border-b' : ''}`}
                   style={{ borderColor: 'var(--color-border)' }}>
                <span className="w-8 text-xs text-slate-500 text-center flex-shrink-0">
                  {c.minute ? `${c.minute}'` : '–'}
                </span>
                <span className={`px-2 py-0.5 rounded text-xs font-semibold border flex-shrink-0 ${CARD_COLORS[c.card_type]?.bg || ''}`}>
                  {CARD_COLORS[c.card_type]?.label}
                </span>
                <span className="flex-1 text-sm">{displayName(c.profiles)}</span>
                <button onClick={() => deleteCard(c.id)}
                        className="text-slate-600 hover:text-red-400 transition-colors p-1 flex-shrink-0">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Kaart toevoegen */}
        <form onSubmit={addCard}
              className="rounded-xl border p-3 space-y-2"
              style={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)' }}>
          <div className="flex gap-2">
            <select value={cForm.player_id}
                    onChange={e => setCForm(p => ({ ...p, player_id: e.target.value }))}
                    className={selectClass} style={selectStyle} required>
              <option value="">Speler...</option>
              {roster.map(r => (
                <option key={r.player_id} value={r.player_id}>
                  {displayName(r.profiles)}
                </option>
              ))}
            </select>
            <select value={cForm.card_type}
                    onChange={e => setCForm(p => ({ ...p, card_type: e.target.value }))}
                    className="w-24 px-2 py-2 rounded-lg text-sm outline-none"
                    style={selectStyle}>
              <option value="yellow">Geel</option>
              <option value="red">Rood</option>
            </select>
            <input type="number" min="1" max="90"
                   value={cForm.minute}
                   onChange={e => setCForm(p => ({ ...p, minute: e.target.value }))}
                   placeholder="Min"
                   className="w-16 px-2 py-2 rounded-lg text-sm outline-none text-center"
                   style={selectStyle} />
          </div>
          <button type="submit" disabled={cSaving || !cForm.player_id}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
                  style={{ backgroundColor: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}>
            <Plus size={14} />
            {cSaving ? 'Opslaan...' : 'Kaart toevoegen'}
          </button>
        </form>
      </div>
    </div>
  )
}
