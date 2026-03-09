import React, { useEffect, useMemo, useState } from 'react'
import { Trash2, Edit2 } from 'lucide-react'
import getTauriModule from '../../utils/tauri'
import { useSettings } from '../../contexts/SettingsContext'
import TournamentWizardModal from './TournamentWizardModal'
import { useAppToast } from '../AppToastProvider'
import { useAppConfirm } from '../AppConfirmProvider'

function formatDate(dateValue) {
  if (!dateValue) return '—'
  const dt = new Date(dateValue)
  if (Number.isNaN(dt.getTime())) return String(dateValue)
  return dt.toLocaleDateString()
}

function championInitials(name) {
  if (!name) return '??'
  const parts = String(name).trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '??'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase()
}

export default function TournamentArea() {
  const [tournaments, setTournaments] = useState([])
  const [champions, setChampions] = useState([])
  const [championImages, setChampionImages] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [filterMode, setFilterMode] = useState('all')
  const [isWizardOpen, setIsWizardOpen] = useState(false)
  const [editingTournament, setEditingTournament] = useState(null)
  const [activeView, setActiveView] = useState('dashboard')
  const [selectedTournamentId, setSelectedTournamentId] = useState('')
  const [deletingTournamentId, setDeletingTournamentId] = useState('')
  const { showToast } = useAppToast()
  const { confirm } = useAppConfirm()

  const { userTag } = useSettings()
  // userTag provided by SettingsProvider via useSettings()

  async function loadTournaments() {
    const tauri = await getTauriModule()
    if (!tauri) {
      setTournaments([])
      return
    }
    const res = await tauri.invoke('list_tournaments')
    if (Array.isArray(res)) {
      setTournaments(res)
    } else {
      setTournaments([])
    }
  }

  async function loadChampions() {
    const tauri = await getTauriModule()
    if (!tauri) {
      setChampions([])
      return
    }
    const res = await tauri.invoke('list_champions')
    if (Array.isArray(res)) {
      setChampions(res)
    } else {
      setChampions([])
    }
  }

  // fetch champion thumbnails (data URLs) for champions that expose an icon
  async function loadChampionImages(list) {
    try {
      const tauri = await getTauriModule()
      if (!tauri) return
      list.forEach(async (c) => {
        try {
          if (c && c.id && c.icon && c.icon.path) {
            const url = await tauri.invoke('get_image_data', { filename: c.icon.path })
            setChampionImages((prev) => ({ ...prev, [c.id]: url }))
          }
        } catch (e) {
          // ignore missing images
        }
      })
    } catch (e) {
      // ignore
    }
  }

  // ensure images are loaded whenever the champions list updates
  useEffect(() => {
    try {
      if (Array.isArray(champions) && champions.length > 0) {
        loadChampionImages(champions)
      }
    } catch (e) {
      // ignore
    }
  }, [champions])

  useEffect(() => {
    let mounted = true

    async function load() {
      try {
        setIsLoading(true)
        if (!mounted) return
        const champs = await loadChampions()
        // loadChampions doesn't currently return; call it then load images from state
        await Promise.all([loadTournaments(), loadChampions()])
        // attempt to fetch images from the champions state
        // small delay to ensure champions state updated
        setTimeout(() => {
          try {
            if (Array.isArray(champions) && champions.length > 0) loadChampionImages(champions)
          } catch (e) {}
        }, 50)
      } catch (e) {
        console.debug('tournament area load failed', e)
        if (mounted) {
          setTournaments([])
          setChampions([])
        }
      } finally {
        if (mounted) setIsLoading(false)
      }
    }

    load()
    return () => { mounted = false }
  }, [])

  const filteredTournaments = useMemo(() => {
    if (filterMode === 'all') return tournaments
    return tournaments.filter((t) => String(t && t.mode ? t.mode : '').toLowerCase() === filterMode)
  }, [tournaments, filterMode])

  const allMatches = useMemo(() => {
    return tournaments.flatMap((tournament) => (
      Array.isArray(tournament && tournament.matches) ? tournament.matches : []
    ))
  }, [tournaments])

  const wins = useMemo(() => {
    return allMatches.filter((m) => String(m && m.result ? m.result : '').toLowerCase() === 'win').length
  }, [allMatches])

  const losses = useMemo(() => {
    return allMatches.filter((m) => String(m && m.result ? m.result : '').toLowerCase() === 'loss').length
  }, [allMatches])

  const winRate = allMatches.length > 0 ? Math.round((wins / allMatches.length) * 100) : 0

  const perTournamentSummary = useMemo(() => {
    return tournaments.slice(0, 8).map((tournament, idx) => {
      const matches = Array.isArray(tournament && tournament.matches) ? tournament.matches : []
      const localWins = matches.filter((m) => String(m && m.result ? m.result : '').toLowerCase() === 'win').length
      const localLosses = matches.filter((m) => String(m && m.result ? m.result : '').toLowerCase() === 'loss').length
      return {
        label: idx + 1,
        wins: localWins,
        losses: localLosses,
      }
    })
  }, [tournaments])

  const maxStack = useMemo(() => {
    const value = perTournamentSummary.reduce((max, row) => Math.max(max, row.wins + row.losses), 0)
    return value > 0 ? value : 1
  }, [perTournamentSummary])

  const championStats = useMemo(() => {
    const map = new Map()

    allMatches.forEach((match) => {
      const result = String(match && match.result ? match.result : '').toLowerCase()
      const champions = [match && match.our_main_champion, match && match.our_assist_champion]

      champions.forEach((ch) => {
        const id = ch && ch.id ? String(ch.id) : null
        if (!id) return
        const existing = map.get(id) || {
          id,
          name: ch && ch.name ? ch.name : 'Unknown',
          played: 0,
          wins: 0,
        }
        existing.played += 1
        if (result === 'win') existing.wins += 1
        map.set(id, existing)
      })
    })

    return Array.from(map.values()).map((item) => ({
      ...item,
      winRate: item.played > 0 ? Math.round((item.wins / item.played) * 100) : 0,
    }))
  }, [allMatches])

  const mostPlayed = useMemo(() => {
    if (championStats.length === 0) return null
    return championStats.slice().sort((a, b) => b.played - a.played)[0]
  }, [championStats])

  const bestWinRate = useMemo(() => {
    if (championStats.length === 0) return null
    return championStats
      .filter((c) => c.played > 0)
      .slice()
      .sort((a, b) => {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate
        return b.played - a.played
      })[0] || null
  }, [championStats])

  const recentTournaments = useMemo(() => tournaments.slice(0, 5), [tournaments])

  const selectedTournament = useMemo(() => {
    if (filteredTournaments.length === 0) return null
    const found = filteredTournaments.find((t) => String(t && t.id ? t.id : '') === String(selectedTournamentId))
    return found || filteredTournaments[0]
  }, [filteredTournaments, selectedTournamentId])

  async function handleDeleteTournament(tournamentId) {
    const id = String(tournamentId || '')
    if (!id) return

    const approved = await confirm({
      title: 'Delete Tournament',
      message: 'This action cannot be undone, are you sure you want to continue?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    })
    if (!approved) return

    setDeletingTournamentId(id)
    try {
      const tauri = await getTauriModule()
      if (!tauri) {
        showToast({ type: 'error', text: 'Could not connect to app backend.' })
        return
      }
      await tauri.invoke('delete_tournament', { tournamentId: id })
      await loadTournaments()
      setSelectedTournamentId('')
      showToast({ type: 'success', text: 'Tournament deleted.' })
    } catch (error) {
      console.error('delete tournament failed', error)
      showToast({ type: 'error', text: 'Delete failed. Please try again.' })
    } finally {
      setDeletingTournamentId('')
    }
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="card p-4 md:p-5 min-h-[calc(100vh-120px)]">
        {activeView === 'list' ? (
          <section className="min-w-0">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-4xl font-semibold">All Tournaments</h2>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsWizardOpen(true)}
                  className="px-4 py-2 rounded bg-[var(--color-accent-primary)] text-white font-medium"
                >
                  + Record New Tournament
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('dashboard')}
                  className="px-4 py-2 rounded bg-[rgba(255,255,255,0.03)] text-text-muted font-medium"
                >
                  Back to Dashboard
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between mb-3 border-b border-[rgba(255,255,255,0.06)] pb-2">
              <div className="flex items-center gap-2">
                {['all', 'online', 'offline'].map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFilterMode(mode)}
                    className={`px-2.5 py-1 rounded text-sm ${filterMode === mode ? 'bg-[rgba(58,141,255,0.20)] text-white' : 'bg-[rgba(255,255,255,0.03)] text-text-muted'}`}
                  >
                    {mode === 'all' ? 'All' : (mode === 'online' ? 'Online' : 'Offline')}
                  </button>
                ))}
              </div>
              <div className="text-sm text-text-muted">{isLoading ? 'Loading…' : `${filteredTournaments.length} entries`}</div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-[0.7fr_1fr] gap-4">
              <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
                {filteredTournaments.length === 0 ? (
                  <div className="text-text-muted py-8 text-center border border-[rgba(255,255,255,0.06)] rounded">No tournaments yet.</div>
                ) : (
                  filteredTournaments.map((tournament, idx) => {
                    const matches = Array.isArray(tournament && tournament.matches) ? tournament.matches : []
                    const localWins = matches.filter((m) => String(m && m.result ? m.result : '').toLowerCase() === 'win').length
                    const localLosses = matches.filter((m) => String(m && m.result ? m.result : '').toLowerCase() === 'loss').length
                    const isSelected = String(selectedTournament && selectedTournament.id ? selectedTournament.id : '') === String(tournament && tournament.id ? tournament.id : '')

                    return (
                      <button
                        key={tournament.id || idx}
                        type="button"
                        onClick={() => setSelectedTournamentId(String(tournament && tournament.id ? tournament.id : ''))}
                        className={`w-full text-left rounded border p-3 ${isSelected ? 'border-[rgba(58,141,255,0.45)] bg-[rgba(58,141,255,0.10)]' : 'border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]'}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-xl font-semibold truncate">{tournament.title || `Tournament ${idx + 1}`}</div>
                            <div className="text-sm text-[var(--color-accent-primary)] truncate">{tournament.sponsor || 'Unknown sponsor'}</div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="text-text-muted text-sm">{formatDate(tournament.happened_on)}</div>
                            <div className={`text-2xl font-semibold ${localWins >= localLosses ? 'text-[var(--color-accent-success)]' : 'text-rose-400'}`}>{`${localWins}-${localLosses}`}</div>
                          </div>
                        </div>
                      </button>
                    )
                  })
                )}
              </div>

              <div className="rounded border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-4 max-h-[650px] overflow-y-auto">
                {!selectedTournament ? (
                  <div className="text-text-muted">Select a tournament to view details.</div>
                ) : (
                  <>
                    <div className="mb-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-2xl font-semibold truncate">{selectedTournament.title || 'Untitled Tournament'}</h3>
                          <div className="text-sm text-text-muted mt-1">{formatDate(selectedTournament.happened_on)} · {selectedTournament.mode || '—'} · {selectedTournament.sponsor || 'Unknown sponsor'}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => { setEditingTournament(selectedTournament); setIsWizardOpen(true) }}
                            className="w-8 h-8 rounded border border-[rgba(255,255,255,0.06)] text-text-muted hover:bg-[rgba(255,255,255,0.03)]"
                            title="Edit Tournament"
                            aria-label="Edit Tournament"
                          >
                            <Edit2 size={14} className="mx-auto" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDeleteTournament(selectedTournament.id)}
                            disabled={deletingTournamentId === String(selectedTournament.id)}
                            className="w-8 h-8 rounded border border-[rgba(226,76,75,0.5)] text-rose-300 hover:bg-[rgba(226,76,75,0.16)] disabled:opacity-60"
                            title="Delete Tournament"
                            aria-label="Delete Tournament"
                          >
                            <Trash2 size={14} className="mx-auto" />
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 mb-3 text-sm">
                      <div className="rounded border border-[rgba(255,255,255,0.05)] px-3 py-2">
                        <div className="text-text-muted">Final Placement</div>
                        <div className="font-semibold mt-0.5">{selectedTournament.final_placement || '—'}</div>
                      </div>
                      <div className="rounded border border-[rgba(255,255,255,0.05)] px-3 py-2">
                        <div className="text-text-muted">Matches</div>
                        <div className="font-semibold mt-0.5">{Array.isArray(selectedTournament.matches) ? selectedTournament.matches.length : 0}</div>
                      </div>
                    </div>

                    {selectedTournament.notes ? (
                      <div className="rounded border border-[rgba(255,255,255,0.05)] px-3 py-2 text-sm mb-3">
                        <div className="text-text-muted mb-1">Notes</div>
                        <div className="whitespace-pre-wrap">{selectedTournament.notes}</div>
                      </div>
                    ) : null}

                    <div>
                      <div className="text-lg font-semibold mb-2">Match Details</div>
                      <div className="space-y-2">
                        {Array.isArray(selectedTournament.matches) && selectedTournament.matches.length > 0 ? (
                          selectedTournament.matches.map((match, idx) => {
                              const ourMainName = match && match.our_main_champion && match.our_main_champion.name ? match.our_main_champion.name : '—'
                              const ourAssistName = match && match.our_assist_champion && match.our_assist_champion.name ? match.our_assist_champion.name : ''
                            const result = String(match && match.result ? match.result : '').toLowerCase()
                            return (
                              <div key={match && match.id ? match.id : idx} className="rounded border border-[rgba(255,255,255,0.05)] px-3 py-2">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-sm">
                                    <span className="font-semibold">{(!ourAssistName && match && match.opponent_name && userTag) ? userTag : ourMainName}</span>
                                    {ourAssistName ? ` + ${ourAssistName}` : ''}
                                    <span className="text-text-muted"> vs </span>
                                    <span className="font-semibold">{match && match.opponent_name ? match.opponent_name : 'Unknown opponent'}</span>
                                  </div>
                                  <div className={`text-sm font-semibold ${result === 'win' ? 'text-[var(--color-accent-success)]' : result === 'loss' ? 'text-rose-400' : 'text-text-muted'}`}>
                                    {result ? result.toUpperCase() : '—'}
                                  </div>
                                </div>
                              </div>
                            )
                          })
                        ) : (
                          <div className="text-sm text-text-muted">No matches saved for this tournament.</div>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-5">
            <section className="min-w-0">
              <h2 className="text-4xl font-semibold mb-4">Tournament Tracking</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
              <div className="rounded-md border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="text-lg text-text-muted">Tournaments Played</div>
                <div className="text-5xl font-semibold mt-1">{filteredTournaments.length}</div>
              </div>
              <div className="rounded-md border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="text-lg text-text-muted">Matches Played</div>
                <div className="text-5xl font-semibold mt-1">{allMatches.length}</div>
              </div>
              <div className="rounded-md border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-4">
                <div className="text-lg text-text-muted">Win Rate</div>
                <div className="text-5xl font-semibold mt-1 text-[var(--color-accent-success)]">{winRate}%</div>
              </div>
            </div>

              <div className="mb-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsWizardOpen(true)}
                  className="px-4 py-2 rounded bg-[var(--color-accent-primary)] text-white font-medium"
                >
                  + Record New Tournament
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('list')}
                  className="px-4 py-2 rounded bg-[rgba(255,255,255,0.03)] text-text-muted font-medium"
                >
                  View All Tournaments
                </button>
              </div>

              <div className="rounded-md border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xl font-semibold">Recent Tournaments</h3>
                  <span className="text-sm text-text-muted">{recentTournaments.length} shown</span>
                </div>

                <div className="space-y-1.5">
                  {recentTournaments.length === 0 ? (
                    <div className="text-sm text-text-muted py-2">No tournaments yet.</div>
                  ) : (
                    recentTournaments.map((tournament, idx) => {
                      const matches = Array.isArray(tournament && tournament.matches) ? tournament.matches : []
                      const localWins = matches.filter((m) => String(m && m.result ? m.result : '').toLowerCase() === 'win').length
                      const localLosses = matches.filter((m) => String(m && m.result ? m.result : '').toLowerCase() === 'loss').length
                      const mainMatch = matches && matches.length > 0 ? matches[0] : null
                      const mainChampionId = mainMatch && mainMatch.our_main_champion && mainMatch.our_main_champion.id ? String(mainMatch.our_main_champion.id) : (mainMatch && mainMatch.our_main_champion_id ? String(mainMatch.our_main_champion_id) : null)
                      const mainChampionName = mainMatch && mainMatch.our_main_champion && mainMatch.our_main_champion.name ? mainMatch.our_main_champion.name : (mainChampionId ? (champions.find(c => String(c.id) === mainChampionId) || {}).name : null)
                      const thumbUrl = mainChampionId ? championImages[String(mainChampionId)] : null

                      return (
                        <button
                          key={tournament.id || idx}
                          type="button"
                          onClick={() => {
                            setFilterMode('all')
                            setSelectedTournamentId(String(tournament && tournament.id ? tournament.id : ''))
                            setActiveView('list')
                          }}
                          className="w-full text-left flex items-center justify-between gap-3 rounded border border-[rgba(255,255,255,0.05)] px-3 py-2 hover:bg-[rgba(255,255,255,0.03)]"
                          title="Open tournament details"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="min-w-0">
                              <div className="text-base font-semibold truncate">{tournament.title || `Tournament ${idx + 1}`}</div>
                              <div className="text-xs text-text-muted">{formatDate(tournament.happened_on)}</div>
                            </div>
                          </div>
                          <div className={`text-sm font-semibold shrink-0 ${localWins >= localLosses ? 'text-[var(--color-accent-success)]' : 'text-rose-400'}`}>
                            {`${localWins}-${localLosses}`}
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            </section>

            <aside className="min-w-0 border-l border-[rgba(255,255,255,0.08)] pl-5">
            <h3 className="text-3xl font-semibold mb-3">Tournament Overview</h3>

              <div className="rounded-md border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-3 mb-4">
              <div className="text-xl text-text-muted mb-2">Matches Summary</div>
              <div className="h-72 grid grid-cols-8 gap-2 items-end">
                {perTournamentSummary.map((row, idx) => {
                  const total = row.wins + row.losses
                  const totalPct = Math.max((total / maxStack) * 100, 6)
                  const winPct = total > 0 ? (row.wins / total) * 100 : 0
                  const lossPct = total > 0 ? (row.losses / total) * 100 : 0

                  return (
                    <div key={idx} className="flex flex-col items-center justify-end h-full">
                      <div className="w-8 h-[220px] flex items-end">
                        <div className="w-full rounded-t overflow-hidden border border-[rgba(255,255,255,0.08)]" style={{ height: `${totalPct}%` }}>
                          <div className="w-full bg-[var(--color-accent-success)]" style={{ height: `${winPct}%` }} />
                          <div className="w-full bg-[var(--color-accent-danger)]" style={{ height: `${lossPct}%` }} />
                        </div>
                      </div>
                      <div className="text-xs text-text-muted mt-1">{row.label}</div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-2 flex items-center gap-4 text-sm text-text-muted">
                <div className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--color-accent-success)]" /> Wins</div>
                <div className="flex items-center gap-2"><span className="inline-block w-2.5 h-2.5 rounded-full bg-[var(--color-accent-danger)]" /> Losses</div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <h4 className="text-3xl font-semibold mb-2">Most Played</h4>
                <div className="rounded-md border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-3 flex items-center gap-3">
                  {mostPlayed && championImages[String(mostPlayed.id)] ? (
                    <img src={championImages[String(mostPlayed.id)]} alt={mostPlayed.name || 'champion'} className="w-14 h-14 rounded object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded bg-[rgba(58,141,255,0.25)] flex items-center justify-center font-semibold">{championInitials(mostPlayed && mostPlayed.name)}</div>
                  )}
                  <div className="min-w-0">
                    <div className="text-2xl font-semibold truncate">{(mostPlayed && mostPlayed.name) || '—'}</div>
                    {mostPlayed ? (
                      <div className="text-sm text-text-muted">
                        <div>{mostPlayed.played} matches</div>
                        <div className="mt-1">{mostPlayed.wins} wins</div>
                      </div>
                    ) : (
                      <div className="text-sm text-text-muted">No data yet</div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="text-3xl font-semibold mb-2">Best Win Rate</h4>
                <div className="rounded-md border border-[rgba(255,255,255,0.05)] bg-[rgba(255,255,255,0.02)] p-3 flex items-center gap-3">
                  {bestWinRate && championImages[String(bestWinRate.id)] ? (
                    <img src={championImages[String(bestWinRate.id)]} alt={bestWinRate.name || 'champion'} className="w-14 h-14 rounded object-cover" />
                  ) : (
                    <div className="w-14 h-14 rounded bg-[rgba(42,199,245,0.25)] flex items-center justify-center font-semibold">{championInitials(bestWinRate && bestWinRate.name)}</div>
                  )}
                  <div className="min-w-0">
                    <div className="text-2xl font-semibold truncate">{(bestWinRate && bestWinRate.name) || '—'}</div>
                    {bestWinRate ? (
                      <div className="text-sm text-text-muted">
                        <div>{bestWinRate.winRate}%</div>
                        <div className="mt-1">{bestWinRate.wins}/{bestWinRate.played} wins</div>
                      </div>
                    ) : (
                      <div className="text-sm text-text-muted">No data yet</div>
                    )}
                  </div>
                </div>
              </div>
            </div>
            </aside>
          </div>
        )}
      </div>

      <TournamentWizardModal
        open={isWizardOpen}
        champions={champions}
        onClose={() => { setIsWizardOpen(false); setEditingTournament(null) }}
        onSaved={async () => {
          await loadTournaments()
          setEditingTournament(null)
        }}
        tournament={editingTournament}
      />
    </main>
  )
}
