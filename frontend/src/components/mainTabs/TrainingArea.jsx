import React, { useEffect, useMemo, useState } from 'react'
import getTauriModule from '../../utils/tauri'
import { Trash2, Edit2 } from 'lucide-react'
import { useAppToast } from '../AppToastProvider'
import { useAppConfirm } from '../AppConfirmProvider'
import TrainingRoutineModal from './TrainingRoutineModal'

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

export default function TrainingArea() {
  const [rows, setRows] = useState([])
  const [champions, setChampions] = useState([])
  const [championImages, setChampionImages] = useState({})
  const [isLoading, setIsLoading] = useState(false)
  const [deletingMatchId, setDeletingMatchId] = useState('')
  const [filterKind, setFilterKind] = useState('all')
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const { showToast } = useAppToast()
  const { confirm } = useAppConfirm()
  const [showRoutineModal, setShowRoutineModal] = useState(false)
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [editingInitial, setEditingInitial] = useState(null)

  async function loadChampions() {
    const tauri = await getTauriModule()
    if (!tauri) return
    try {
      const res = await tauri.invoke('list_champions')
      if (Array.isArray(res)) setChampions(res)
    } catch (e) {
      console.debug('list_champions failed', e)
    }
  }

  async function loadChampionImages(list) {
    const tauri = await getTauriModule()
    if (!tauri) return
    list.forEach(async (c) => {
      try {
        if (c && c.id && c.icon && c.icon.path) {
          const url = await tauri.invoke('get_image_data', { filename: c.icon.path })
          setChampionImages((prev) => ({ ...prev, [c.id]: url }))
        }
      } catch (e) {}
    })
  }

  async function loadRows() {
    setIsLoading(true)
    try {
      const tauri = await getTauriModule()
      if (!tauri) {
        setRows([])
        return
      }
      const res = await tauri.invoke('list_training_matches')
      if (Array.isArray(res)) setRows(res)
      else setRows([])
    } catch (e) {
      console.error('failed to load training matches', e)
      setRows([])
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadChampions()
    loadRows()
  }, [])

  useEffect(() => {
    if (Array.isArray(champions) && champions.length > 0) loadChampionImages(champions)
  }, [champions])

  const groups = useMemo(() => {
    // group rows by match_group_id
    const map = new Map()
    rows.forEach((r) => {
      const gid = r && r.match_group_id ? String(r.match_group_id) : null
      if (!gid) return
      if (!map.has(gid)) map.set(gid, { id: gid, kind: r.group_kind || 'casual', notes: r.group_notes || '', session_happened_on: r.session_happened_on || null, matches: [] })
      map.get(gid).matches.push(r)
    })
    // convert to array sorted by most recent match created_at
    return Array.from(map.values()).sort((a, b) => {
      const aDate = a.matches.length > 0 ? new Date(a.matches[0].created_at || 0).getTime() : 0
      const bDate = b.matches.length > 0 ? new Date(b.matches[0].created_at || 0).getTime() : 0
      return bDate - aDate
    })
  }, [rows])

  const visibleGroups = useMemo(() => {
    if (filterKind === 'all') return groups
    return groups.filter(g => String(g.kind).toLowerCase() === filterKind)
  }, [groups, filterKind])

  function scoreForGroup(g) {
    const matches = g.matches || []
    let wins = 0, losses = 0
    matches.forEach(m => { const r = m && m.result ? String(m.result).toLowerCase() : ''; if (r === 'win') wins += 1; if (r === 'loss') losses += 1 })
    return { wins, losses }
  }

  async function handleDeleteMatch(matchId) {
    if (!matchId) return
    const approved = await confirm({
      title: 'Delete Training Match',
      message: 'This will permanently delete the training match. Continue?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    })
    if (!approved) return

    setDeletingMatchId(String(matchId))
    try {
      const tauri = await getTauriModule()
      if (!tauri) {
        showToast({ type: 'error', text: 'Backend unavailable' })
        return
      }
      await tauri.invoke('delete_tournament_match', { matchId: String(matchId) })
      await loadRows()
      showToast({ type: 'success', text: 'Match deleted' })
    } catch (e) {
      console.error('delete training match failed', e)
      showToast({ type: 'error', text: 'Delete failed' })
    } finally {
      setDeletingMatchId('')
    }
  }

  const selectedGroup = useMemo(() => {
    if (!selectedGroupId) return visibleGroups[0] || null
    return visibleGroups.find(g => String(g.id) === String(selectedGroupId)) || null
  }, [visibleGroups, selectedGroupId])

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="card p-4 md:p-5 min-h-[calc(100vh-120px)]">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-4xl font-semibold">All Routines</h2>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setShowRoutineModal(true)} className="px-4 py-2 rounded bg-[var(--color-accent-primary)] text-white font-medium">+ Log New Routine</button>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-4">
          <button className={`px-3 py-1 rounded ${filterKind === 'ranked' ? 'bg-[rgba(58,141,255,0.14)] text-white' : 'bg-[rgba(255,255,255,0.02)] text-text-muted'}`} onClick={() => setFilterKind('ranked')}>Ranked</button>
          <button className={`px-3 py-1 rounded ${filterKind === 'casual' ? 'bg-[rgba(58,141,255,0.14)] text-white' : 'bg-[rgba(255,255,255,0.02)] text-text-muted'}`} onClick={() => setFilterKind('casual')}>Casual</button>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1fr] gap-4">
          <div className="space-y-3 max-h-[650px] overflow-y-auto pr-1">
            {visibleGroups.length === 0 ? (
              <div className="text-text-muted py-8 text-center border border-[rgba(255,255,255,0.06)] rounded">No routines yet.</div>
            ) : (
              visibleGroups.map((g, idx) => {
                const s = scoreForGroup(g)
                const label = g.session_happened_on ? formatDate(g.session_happened_on) : `Routine ${idx + 1}`
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => setSelectedGroupId(g.id)}
                    className={`w-full text-left rounded border p-3 flex items-start justify-between gap-3 ${selectedGroup && String(selectedGroup.id) === String(g.id) ? 'border-[rgba(58,141,255,0.45)] bg-[rgba(58,141,255,0.06)]' : 'border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]'}`}
                  >
                    <div className="min-w-0">
                      <div className="text-lg font-semibold truncate">{label}</div>
                      <div className="text-sm text-[var(--color-accent-primary)] truncate">{g.kind ? (g.kind === 'ranked' ? 'Ranked' : 'Casual') : 'Casual'}</div>
                      <div className="text-sm text-text-muted mt-1">{g.matches.length} matches</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className={`text-2xl font-semibold ${s.wins >= s.losses ? 'text-[var(--color-accent-success)]' : 'text-rose-400'}`}>{`${s.wins}-${s.losses}`}</div>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          <div className="rounded border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)] p-4 max-h-[650px] overflow-y-auto">
            {!selectedGroup ? (
              <div className="text-text-muted">Select a routine to view details.</div>
            ) : (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-2xl font-semibold">{selectedGroup.session_happened_on ? formatDate(selectedGroup.session_happened_on) : 'Routine'}</h3>
                    <div className="text-sm text-text-muted mt-1">Group: {selectedGroup.kind || 'Casual'}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => {
                      if (!selectedGroup) return
                      // prepare initial payload for modal
                      const initial = {
                        session: {
                          happened_on: selectedGroup.session_happened_on || '',
                          kind: selectedGroup.kind || 'casual',
                          notes: selectedGroup.notes || selectedGroup.group_notes || '',
                        },
                        matches: (selectedGroup.matches || []).map((m) => ({
                          our_main_champion_id: m.our_main_champion_id || (m.our_main_champion && String(m.our_main_champion.id)) || '',
                          our_assist_champion_id: m.our_assist_champion_id || (m.our_assist_champion && String(m.our_assist_champion.id)) || '',
                          result: m.result || 'win',
                          opponent_name: m.opponent_name || '',
                          opponent_main_champion_id: m.opponent_main_champion_id || (m.opponent_main_champion && String(m.opponent_main_champion.id)) || '',
                          opponent_assist_champion_id: m.opponent_assist_champion_id || (m.opponent_assist_champion && String(m.opponent_assist_champion.id)) || '',
                          notes: m.notes || '',
                          played_at: m.played_at || '',
                        }))
                      }
                      setEditingGroupId(String(selectedGroup.id))
                      setEditingInitial(initial)
                      setShowRoutineModal(true)
                    }} className="w-8 h-8 rounded border border-[rgba(255,255,255,0.06)] text-text-muted hover:bg-[rgba(255,255,255,0.03)]" title="Edit Routine"><Edit2 size={14} className="mx-auto" /></button>
                    <button type="button" className="w-8 h-8 rounded border border-[rgba(226,76,75,0.5)] text-rose-300 hover:bg-[rgba(226,76,75,0.16)]" title="Delete Routine"><Trash2 size={14} className="mx-auto" /></button>
                  </div>
                </div>

                {selectedGroup.notes ? (
                  <div className="rounded border border-[rgba(255,255,255,0.05)] px-3 py-2 text-sm mb-3">
                    <div className="text-text-muted mb-1">Note</div>
                    <div className="whitespace-pre-wrap">{selectedGroup.notes}</div>
                  </div>
                ) : null}

                <div>
                  <div className="text-lg font-semibold mb-2">Matches</div>
                  <div className="space-y-2">
                    {selectedGroup.matches.map((m, idx) => {
                      const ourMainName = m && m.our_main_champion && m.our_main_champion.name ? m.our_main_champion.name : '—'
                      const ourAssistName = m && m.our_assist_champion && m.our_assist_champion.name ? m.our_assist_champion.name : ''
                      const result = m && m.result ? String(m.result).toLowerCase() : ''
                      const thumbId = m && m.our_main_champion && m.our_main_champion.id ? String(m.our_main_champion.id) : null
                      const thumbUrl = thumbId ? championImages[String(thumbId)] : null

                      return (
                        <div key={m.id || idx} className="rounded border border-[rgba(255,255,255,0.05)] px-3 py-2 flex items-center justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-12 h-12 rounded overflow-hidden bg-[rgba(255,255,255,0.02)] flex items-center justify-center text-sm">
                              {thumbUrl ? <img src={thumbUrl} alt={ourMainName} className="w-full h-full object-cover" /> : <div className="font-semibold">{championInitials(ourMainName)}</div>}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold truncate">{ourMainName}{ourAssistName ? ` + ${ourAssistName}` : ''}</div>
                              <div className="text-sm text-text-muted">vs {m && m.opponent_name ? m.opponent_name : 'Unknown'}</div>
                              <div className="text-sm text-text-muted">{formatDate(m && m.played_at)}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className={`text-sm font-semibold ${result === 'win' ? 'text-[var(--color-accent-success)]' : result === 'loss' ? 'text-rose-400' : 'text-text-muted'}`}>{result ? result.toUpperCase() : '—'}</div>
                            <button
                              type="button"
                              onClick={() => handleDeleteMatch(m && m.id ? m.id : null)}
                              disabled={deletingMatchId === String(m && m.id ? m.id : '')}
                              className="w-8 h-8 rounded border border-[rgba(226,76,75,0.5)] text-rose-300 hover:bg-[rgba(226,76,75,0.16)] disabled:opacity-60"
                              title="Delete Match"
                              aria-label="Delete Match"
                            >
                              <Trash2 size={14} className="mx-auto" />
                            </button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
        <TrainingRoutineModal
          key={`${showRoutineModal ? 'open' : 'closed'}-${editingGroupId || 'new'}`}
          open={showRoutineModal}
          onClose={() => {
            setShowRoutineModal(false)
            setEditingGroupId(null)
            setEditingInitial(null)
          }}
          champions={champions}
          initial={editingInitial}
          onSaved={async (payload) => {
            console.debug('TrainingArea.onSaved called', { payload, editingGroupId })
            if (!(payload && payload.session && Array.isArray(payload.matches))) {
              // fallback: reload
              try {
                await loadRows()
                showToast({ type: 'success', text: 'Routine saved' })
              } catch (e) {
                showToast({ type: 'error', text: 'Could not save routine' })
              }
              setShowRoutineModal(false)
              setEditingGroupId(null)
              setEditingInitial(null)
              return
            }

            try {
              const ts = Date.now()
              const groupId = editingGroupId ? String(editingGroupId) : `temp-${ts}`
              const newRows = payload.matches.map((m, i) => {
                const id = editingGroupId ? `edit-${groupId}-${i}` : `temp-${ts}-${i}`
                const ourMain = champions.find((c) => String(c.id) === String(m.our_main_champion_id))
                const ourAssist = champions.find((c) => String(c.id) === String(m.our_assist_champion_id))
                const oppMain = champions.find((c) => String(c.id) === String(m.opponent_main_champion_id))
                const oppAssist = champions.find((c) => String(c.id) === String(m.opponent_assist_champion_id))
                return {
                  id,
                  training_session_id: null,
                  match_group_id: groupId,
                  group_kind: payload.session.kind,
                  group_notes: payload.session.notes || null,
                  session_happened_on: payload.session.happened_on || null,
                  our_main_champion_id: m.our_main_champion_id || null,
                  our_assist_champion_id: m.our_assist_champion_id || null,
                  result: m.result || null,
                  opponent_name: m.opponent_name || null,
                  opponent_main_champion_id: m.opponent_main_champion_id || null,
                  opponent_assist_champion_id: m.opponent_assist_champion_id || null,
                  notes: m.notes || null,
                  played_at: m.played_at || payload.session.happened_on || null,
                  sort_order: i,
                  created_at: new Date().toISOString(),
                  our_main_champion: ourMain ? { id: String(ourMain.id), name: ourMain.name, code: ourMain.code } : null,
                  our_assist_champion: ourAssist ? { id: String(ourAssist.id), name: ourAssist.name, code: ourAssist.code } : null,
                  opponent_main_champion: oppMain ? { id: String(oppMain.id), name: oppMain.name, code: oppMain.code } : null,
                  opponent_assist_champion: oppAssist ? { id: String(oppAssist.id), name: oppAssist.name, code: oppAssist.code } : null,
                }
              })

              // Replace old rows for edited group, or prepend for new
              setRows((prev) => {
                if (editingGroupId) {
                  const filtered = prev.filter((r) => String(r.match_group_id) !== String(editingGroupId))
                  return newRows.concat(filtered)
                }
                return newRows.concat(prev)
              })

              setShowRoutineModal(false)
              setSelectedGroupId(groupId)
              showToast({ type: 'success', text: 'Routine saved' })
              setEditingGroupId(null)
              setEditingInitial(null)
              return
            } catch (e) {
              console.error('optimistic insert failed', e)
            }

            // Fallback: reload from backend
            try {
              await loadRows()
              showToast({ type: 'success', text: 'Routine saved' })
            } catch (e) {
              showToast({ type: 'error', text: 'Could not save routine' })
            }
            setShowRoutineModal(false)
            setEditingGroupId(null)
            setEditingInitial(null)
          }}
        />
      </div>
    </main>
  )
}
