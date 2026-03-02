import React, { useMemo, useState } from 'react'
import getTauriModule from '../../utils/tauri'
import { useAppConfirm } from '../AppConfirmProvider'
import { Trash2 } from 'lucide-react'

function emptyTournament() {
  return {
    title: '',
    happened_on: '',
    sponsor: '',
    mode: 'offline',
    final_placement: '',
    notes: '',
  }
}

function emptyMatch() {
  return {
    our_main_champion_id: '',
    our_assist_champion_id: '',
    result: 'win',
    opponent_name: '',
    opponent_main_champion_id: '',
    opponent_assist_champion_id: '',
    notes: '',
    played_at: '',
  }
}

function championNameById(champions, id) {
  if (!id) return '—'
  const found = champions.find((ch) => String(ch.id) === String(id))
  return found && found.name ? found.name : String(id)
}

export default function TournamentWizardModal({
  open,
  onClose,
  onSaved,
  champions = [],
}) {
  const [step, setStep] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [errorText, setErrorText] = useState('')
  const [tournamentDraft, setTournamentDraft] = useState(emptyTournament())
  const [matchDraft, setMatchDraft] = useState(emptyMatch())
  const [matches, setMatches] = useState([])
  const { confirm } = useAppConfirm()
  const totalSteps = 3

  async function handleDeleteMatch(index) {
    try {
      const ok = await confirm({
        title: 'Delete match',
        message: 'Remove this match from the tournament? This cannot be undone.',
        confirmText: 'Delete',
        cancelText: 'Cancel',
        danger: true,
      })

      if (!ok) return

      setMatches((prev) => prev.filter((_, i) => i !== index))
    } catch (e) {
      // ignore
    }
  }

  const availableAssistChampions = useMemo(() => {
    const currentMain = String(matchDraft.our_main_champion_id || '')
    return champions.filter((ch) => String(ch.id) !== currentMain)
  }, [champions, matchDraft.our_main_champion_id])

  if (!open) return null

  function resetAndClose() {
    setStep(1)
    setErrorText('')
    setTournamentDraft(emptyTournament())
    setMatchDraft(emptyMatch())
    setMatches([])
    onClose()
  }

  function validateStep1() {
    if (!String(tournamentDraft.title || '').trim()) {
      setErrorText('Tournament title is required.')
      return false
    }
    return true
  }

  function validateStep2() {
    if (!String(matchDraft.our_main_champion_id || '').trim()) {
      setErrorText('Main champion is required.')
      return false
    }
    if (!String(matchDraft.opponent_name || '').trim()) {
      setErrorText('Opponent name is required.')
      return false
    }
    return true
  }

  function addCurrentMatchAndGoSummary() {
    if (!validateStep2()) return
    setMatches((prev) => prev.concat({ ...matchDraft }))
    setMatchDraft(emptyMatch())
    setErrorText('')
    setStep(3)
  }

  function handleBackFromSummary() {
    if (matches.length === 0) {
      setStep(2)
      return
    }
    const copy = matches.slice()
    const last = copy.pop()
    setMatches(copy)
    setMatchDraft(last || emptyMatch())
    setStep(2)
  }

  async function handleSave() {
    if (!validateStep1()) {
      setStep(1)
      return
    }
    if (matches.length === 0) {
      setErrorText('Add at least one match before saving.')
      return
    }

    setIsSaving(true)
    setErrorText('')

    try {
      const tauri = await getTauriModule()
      if (!tauri) throw new Error('Tauri unavailable')

      const tournamentPayload = {
        title: tournamentDraft.title.trim(),
        happened_on: tournamentDraft.happened_on || null,
        sponsor: tournamentDraft.sponsor.trim() || null,
        mode: tournamentDraft.mode,
        final_placement: tournamentDraft.final_placement.trim() || null,
        notes: tournamentDraft.notes.trim() || null,
      }

      const createdTournament = await tauri.invoke('create_tournament', {
        tournamentJson: JSON.stringify(tournamentPayload),
      })

      const tournamentId = createdTournament && createdTournament.id ? String(createdTournament.id) : ''
      if (!tournamentId) throw new Error('Tournament creation returned no id')

      for (let i = 0; i < matches.length; i += 1) {
        const m = matches[i]
        const matchPayload = {
          our_main_champion_id: m.our_main_champion_id,
          our_assist_champion_id: m.our_assist_champion_id || null,
          result: m.result,
          opponent_name: String(m.opponent_name || '').trim(),
          opponent_main_champion_id: m.opponent_main_champion_id || null,
          opponent_assist_champion_id: m.opponent_assist_champion_id || null,
          notes: String(m.notes || '').trim() || null,
          played_at: m.played_at || tournamentDraft.happened_on || null,
          sort_order: i,
        }

        await tauri.invoke('add_tournament_match', {
          tournamentId,
          matchJson: JSON.stringify(matchPayload),
        })
      }

      if (onSaved) await onSaved()
      resetAndClose()
    } catch (e) {
      console.error('save tournament wizard failed', e)
      setErrorText('Could not save tournament. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={() => { if (!isSaving) resetAndClose() }} />

      <div className="relative z-10 w-[720px] max-w-[94vw] max-h-[88vh] rounded border border-[var(--color-bg-border)] bg-[var(--color-bg-panel)] p-4 overflow-y-auto">
        <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] pb-2 mb-3">
          <h3 className="text-2xl font-semibold">{step === 1 ? 'New Tournament' : step === 2 ? 'Add Match Details' : 'Summary & Save'}</h3>
          <button
            type="button"
            onClick={() => { if (!isSaving) resetAndClose() }}
            className="w-8 h-8 rounded border border-[rgba(255,255,255,0.12)] text-text-muted hover:bg-[rgba(255,255,255,0.04)]"
            aria-label="Close modal"
          >
            ×
          </button>
        </div>

        {errorText && <div className="mb-2 text-sm text-rose-400">{errorText}</div>}

        {step === 1 && (
          <div className="space-y-2.5">
            <div>
              <label className="block text-sm text-text-muted mb-1">Tournament Title</label>
              <input
                className="w-full px-3 py-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                value={tournamentDraft.title}
                onChange={(e) => setTournamentDraft((prev) => ({ ...prev, title: e.target.value }))}
                placeholder="Enter tournament title"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-text-muted mb-1">Date</label>
                <input
                  type="date"
                  className="w-full px-3 py-1.5 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                  value={tournamentDraft.happened_on}
                  onChange={(e) => setTournamentDraft((prev) => ({ ...prev, happened_on: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Sponsor</label>
                <input
                  className="w-full px-3 py-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                  value={tournamentDraft.sponsor}
                  onChange={(e) => setTournamentDraft((prev) => ({ ...prev, sponsor: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-text-muted mb-1">Mode</label>
                <select
                  className="w-full h-10 px-3 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                  value={tournamentDraft.mode}
                  onChange={(e) => setTournamentDraft((prev) => ({ ...prev, mode: e.target.value }))}
                >
                  <option value="offline">Offline</option>
                  <option value="online">Online</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Final Placement</label>
                <input
                  className="w-full px-3 py-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                  value={tournamentDraft.final_placement}
                  onChange={(e) => setTournamentDraft((prev) => ({ ...prev, final_placement: e.target.value }))}
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">Notes</label>
              <textarea
                rows={5}
                className="w-full px-3 py-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                value={tournamentDraft.notes}
                onChange={(e) => setTournamentDraft((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2.5">
            <div>
              <label className="block text-sm text-text-muted mb-1">Main Champion</label>
              <select
                className="w-full h-10 px-3 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                value={matchDraft.our_main_champion_id}
                onChange={(e) => setMatchDraft((prev) => ({ ...prev, our_main_champion_id: e.target.value, our_assist_champion_id: prev.our_assist_champion_id === e.target.value ? '' : prev.our_assist_champion_id }))}
              >
                <option value="">Select main champion</option>
                {champions.map((ch) => (
                  <option key={ch.id} value={String(ch.id)}>{ch.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">Assist</label>
              <select
                className="w-full h-10 px-3 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                value={matchDraft.our_assist_champion_id}
                onChange={(e) => setMatchDraft((prev) => ({ ...prev, our_assist_champion_id: e.target.value }))}
              >
                <option value="">Optional</option>
                {availableAssistChampions.map((ch) => (
                  <option key={ch.id} value={String(ch.id)}>{ch.name}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">Match Result</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMatchDraft((prev) => ({ ...prev, result: 'win' }))}
                  className={`px-4 py-2 rounded border ${matchDraft.result === 'win' ? 'bg-[rgba(34,197,94,0.2)] border-[rgba(34,197,94,0.45)] text-emerald-200' : 'border-[rgba(255,255,255,0.12)] text-text-muted'}`}
                >
                  Win
                </button>
                <button
                  type="button"
                  onClick={() => setMatchDraft((prev) => ({ ...prev, result: 'loss' }))}
                  className={`px-4 py-2 rounded border ${matchDraft.result === 'loss' ? 'bg-[rgba(226,76,75,0.2)] border-[rgba(226,76,75,0.45)] text-rose-300' : 'border-[rgba(255,255,255,0.12)] text-text-muted'}`}
                >
                  Loss
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">Opponent Name</label>
              <input
                className="w-full px-3 py-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                value={matchDraft.opponent_name}
                onChange={(e) => setMatchDraft((prev) => ({ ...prev, opponent_name: e.target.value }))}
                placeholder="Enter opponent name"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-text-muted mb-1">Opponent Main Champion</label>
                <select
                  className="w-full h-10 px-3 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                  value={matchDraft.opponent_main_champion_id}
                  onChange={(e) => setMatchDraft((prev) => ({ ...prev, opponent_main_champion_id: e.target.value }))}
                >
                  <option value="">Optional</option>
                  {champions.map((ch) => (
                    <option key={ch.id} value={String(ch.id)}>{ch.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-text-muted mb-1">Opponent Assist Champion</label>
                <select
                  className="w-full h-10 px-3 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                  value={matchDraft.opponent_assist_champion_id}
                  onChange={(e) => setMatchDraft((prev) => ({ ...prev, opponent_assist_champion_id: e.target.value }))}
                >
                  <option value="">Optional</option>
                  {champions.map((ch) => (
                    <option key={ch.id} value={String(ch.id)}>{ch.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">Match Notes</label>
              <textarea
                rows={4}
                className="w-full px-3 py-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                value={matchDraft.notes}
                onChange={(e) => setMatchDraft((prev) => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div className="rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3">
              <div className="text-sm text-text-muted mb-1">Tournament</div>
              <div className="text-lg font-semibold mb-2">{tournamentDraft.title || 'Untitled Tournament'}</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-text-muted">Date:</span> {tournamentDraft.happened_on || '—'}</div>
                <div><span className="text-text-muted">Sponsor:</span> {tournamentDraft.sponsor || '—'}</div>
                <div><span className="text-text-muted">Mode:</span> {tournamentDraft.mode}</div>
                <div><span className="text-text-muted">Final Placement:</span> {tournamentDraft.final_placement || '—'}</div>
              </div>
            </div>

            <div>
              <div className="text-lg font-semibold mb-2">Match Details</div>
              <div className="space-y-2 max-h-[280px] overflow-y-auto pr-1">
                {matches.length === 0 ? (
                  <div className="text-sm text-text-muted">No matches added yet.</div>
                ) : (
                  matches.map((m, idx) => (
                    <div key={`${idx}-${m.our_main_champion_id}-${m.opponent_name}`} className="rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm">
                          <span className="font-semibold">{championNameById(champions, m.our_main_champion_id)}</span>
                          {m.our_assist_champion_id ? ` + ${championNameById(champions, m.our_assist_champion_id)}` : ''}
                          <span className="text-text-muted"> vs </span>
                          <span className="font-semibold">{m.opponent_name}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className={`text-sm font-semibold ${m.result === 'win' ? 'text-[var(--color-accent-success)]' : 'text-rose-300'}`}>
                            {m.result.toUpperCase()}
                          </div>
                          <button
                            type="button"
                            onClick={async () => { if (!isSaving) await handleDeleteMatch(idx) }}
                            className="w-7 h-7 rounded border border-[rgba(255,255,255,0.08)] text-text-muted hover:bg-[rgba(255,255,255,0.03)] flex items-center justify-center"
                            aria-label="Delete match"
                          >
                            <Trash2 size={14} className="text-rose-400" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 -mx-4 px-4 pt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setErrorText('')
                if (step === 3) handleBackFromSummary()
                else if (step > 1) setStep(step - 1)
              }}
              disabled={isSaving || step === 1}
              className="px-4 py-1 rounded bg-[rgba(255,255,255,0.03)] text-text-muted disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Back
            </button>

            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1) {
                    if (!validateStep1()) return
                    setErrorText('')
                    setStep(2)
                    return
                  }

                  if (step === 2) {
                    addCurrentMatchAndGoSummary()
                  }
                }}
                disabled={isSaving}
                className="px-5 py-1 rounded bg-[rgba(255,255,255,0.03)] text-text-muted disabled:opacity-60"
              >
                Next
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setErrorText('')
                    setMatchDraft(emptyMatch())
                    setStep(2)
                  }}
                  disabled={isSaving}
                  className="px-4 py-2 rounded bg-[rgba(255,255,255,0.03)] text-text-muted disabled:opacity-60"
                >
                  + Add Match
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isSaving}
                  className="px-5 py-1 rounded bg-[var(--color-accent-primary)] text-white disabled:opacity-60"
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
              </>
            )}
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => { if (!isSaving) resetAndClose() }}
              disabled={isSaving}
              className="px-4 py-1 rounded bg-[rgba(255,255,255,0.03)] text-text-muted disabled:opacity-60"
            >
              Cancel
            </button>
            <span className="text-text-muted text-sm">Step {step} / {totalSteps}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
