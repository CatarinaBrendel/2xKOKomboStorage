import React, { useEffect, useMemo, useState } from 'react'
import { useAppConfirm } from '../AppConfirmProvider'
import { useAppToast } from '../AppToastProvider'

function emptyRoutine() {
  return {
    happened_on: '',
    kind: 'casual',
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

export default function TrainingRoutineModal({ open, onClose, onSaved, champions = [], initial = null }) {
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(1)
  const totalSteps = 3
  const [draft, setDraft] = useState(emptyRoutine())
  const [matches, setMatches] = useState([])
  const [matchDraft, setMatchDraft] = useState(emptyMatch())
  const [showMatchEditor, setShowMatchEditor] = useState(false)
  const [editingMatchIndex, setEditingMatchIndex] = useState(null)
  const { confirm } = useAppConfirm()
  const { showToast } = useAppToast()
  const pushDebug = () => {}
  const isEditing = Boolean(initial && initial.session)

  // no debug helpers in production version

  const availableAssistChampions = useMemo(() => {
    const currentMain = String(matchDraft.our_main_champion_id || '')
    return champions.filter((ch) => String(ch.id) !== currentMain)
  }, [champions, matchDraft.our_main_champion_id])

  // initialize when opened for edit or new
  useEffect(() => {
    if (!open) return
    setStep(1)
    setMatchDraft(emptyMatch())
    setShowMatchEditor(false)
    setEditingMatchIndex(null)

    if (initial && initial.session) {
      setDraft({
        happened_on: initial.session.happened_on || '',
        kind: initial.session.kind || 'casual',
        notes: initial.session.notes || '',
      })
    } else {
      setDraft(emptyRoutine())
    }

    if (initial && Array.isArray(initial.matches)) {
      setMatches(initial.matches.map((m, i) => ({
        _localId: m.id ? String(m.id) : `local-${i}`,
        our_main_champion_id: m.our_main_champion_id || (m.our_main_champion && String(m.our_main_champion.id)) || '',
        our_assist_champion_id: m.our_assist_champion_id || (m.our_assist_champion && String(m.our_assist_champion.id)) || '',
        result: m.result || 'win',
        opponent_name: m.opponent_name || '',
        opponent_main_champion_id: m.opponent_main_champion_id || (m.opponent_main_champion && String(m.opponent_main_champion.id)) || '',
        opponent_assist_champion_id: m.opponent_assist_champion_id || (m.opponent_assist_champion && String(m.opponent_assist_champion.id)) || '',
        notes: m.notes || '',
        played_at: m.played_at || '',
      })))
    } else {
      setMatches([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial])

  if (!open) return null

  // render

  function resetAndClose() {
    setDraft(emptyRoutine())
    setMatches([])
    setMatchDraft(emptyMatch())
    setShowMatchEditor(false)
    setEditingMatchIndex(null)
    onClose()
  }

  function handleCancel() {
    if (saving) return
    resetAndClose()
  }

  function validateMatch() {
    if (!String(matchDraft.our_main_champion_id || '').trim()) return false
    if (!String(matchDraft.opponent_name || '').trim()) return false
    return true
  }

  function startEditMatch(index) {
    const m = matches[index]
    setMatchDraft(m || emptyMatch())
    setEditingMatchIndex(index)
    setShowMatchEditor(true)
    // start edit
  }

  function cancelMatchEdit() {
    setMatchDraft(emptyMatch())
    setEditingMatchIndex(null)
    setShowMatchEditor(false)
  }

  function saveMatch() {
    const ok = validateMatch()
    if (!ok) {
      showToast({ type: 'error', text: 'Please choose a main champion and enter opponent name' })
      return false
    }

    if (editingMatchIndex !== null && editingMatchIndex !== undefined) {
      setMatches((prev) => {
        const copy = prev.slice()
        copy[editingMatchIndex] = { ...matchDraft, _localId: copy[editingMatchIndex]._localId || matchDraft._localId }
        return copy
      })
    } else {
      setMatches((prev) => {
        const item = { ...matchDraft, _localId: `new-${Date.now()}-${prev.length}` }
        return prev.concat(item)
      })
    }

    setMatchDraft(emptyMatch())
    setEditingMatchIndex(null)
    setShowMatchEditor(false)
    return true
  }

  async function handleDeleteMatch(index) {
    try {
      const ok = await confirm({
        title: 'Delete match',
        message: 'Remove this match from the routine? This cannot be undone.',
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

  async function handleSave() {
    pushDebug('handleSave called', { draft, matchesLength: matches.length })
    if (!draft.happened_on) {
      pushDebug('handleSave blocked: missing date')
      showToast({ type: 'error', text: 'Please pick a date for the routine' })
      return
    }
    if (matches.length === 0) {
      pushDebug('handleSave blocked: no matches')
      showToast({ type: 'error', text: 'Add at least one match before saving' })
      return
    }

    setSaving(true)
    try {
      const payload = { session: { ...draft }, matches: matches.map((m, i) => ({ ...m, sort_order: i })) }
      pushDebug('handleSave payload', payload)
      if (onSaved) await onSaved(payload)
      resetAndClose()
    } catch (e) {
      console.error('TrainingRoutineModal.handleSave error', e)
      pushDebug('handleSave error', { e })
    } finally {
      setSaving(false)
    }
  }

  function handleBack() {
    if (saving) return
    setStep((s) => Math.max(1, s - 1))
  }

  function handleNext() {
    if (saving) return
    if (step === 1) {
      if (!draft.happened_on) {
        showToast({ type: 'error', text: 'Please pick a date for the routine' })
        return
      }
    }
    if (step === 2) {
      if (matches.length === 0) {
        showToast({ type: 'error', text: 'Add at least one match before continuing' })
        return
      }
    }
    if (step < totalSteps) setStep((s) => s + 1)
    else handleSave()
  }
return (
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div
      className="absolute inset-0 bg-black/60"
      onClick={() => {
        if (!saving) handleCancel();
      }}
    />

    <div className="relative z-10 w-[640px] max-w-[94vw] max-h-[88vh] rounded border border-[var(--color-bg-border)] bg-[var(--color-bg-panel)] p-4 overflow-y-auto">
      <div className="flex items-center justify-between border-b border-[rgba(255,255,255,0.08)] pb-2 mb-3">
        <h3 className="text-2xl font-semibold">
          {step === 1 ? (isEditing ? 'Edit Routine' : 'Log New Routine') : step === 2 ? 'Add Matches' : 'Summary & Save'}
        </h3>
        <button
          type="button"
          onClick={() => {
            if (!saving) handleCancel();
          }}
          className="w-8 h-8 rounded border border-[rgba(255,255,255,0.12)] text-text-muted hover:bg-[rgba(255,255,255,0.04)]"
          aria-label="Close modal"
        >
          ×
        </button>
      </div>

      <div className="space-y-3">
        {step === 1 && (
          <>
            <div>
              <label className="block text-sm text-text-muted mb-1">Date</label>
              <input
                type="date"
                className="w-full px-3 py-1.5 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                value={draft.happened_on}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, happened_on: e.target.value }))
                }
              />
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">Kind</label>
              <select
                value={draft.kind}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, kind: e.target.value }))
                }
                className="w-full h-10 px-3 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
              >
                <option value="casual">Casual</option>
                <option value="ranked">Ranked</option>
              </select>
            </div>

            <div>
              <label className="block text-sm text-text-muted mb-1">Notes</label>
              <textarea
                rows={4}
                className="w-full px-3 py-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                value={draft.notes}
                onChange={(e) =>
                  setDraft((p) => ({ ...p, notes: e.target.value }))
                }
              />
            </div>
          </>
        )}

        {step === 2 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-sm text-text-muted">Matches</div>
              <div>
                <button
                  type="button"
                  onClick={() => {
                    setMatchDraft(emptyMatch());
                    setEditingMatchIndex(null);
                    setShowMatchEditor(true);
                  }}
                  className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)] text-sm"
                >
                  + Add Match
                </button>
              </div>
            </div>

            <div className="space-y-2 max-h-[200px] overflow-y-auto pr-1 mb-3">
              {matches.length === 0 ? (
                <div className="text-sm text-text-muted">No matches added yet.</div>
              ) : (
                matches.map((m, idx) => (
                  <div
                    key={m._localId || `${idx}-${m.our_main_champion_id}-${m.opponent_name}`}
                    className="rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3 flex items-center justify-between"
                  >
                    <div className="text-sm">
                      <span className="font-semibold">
                        {championNameById(champions, m.our_main_champion_id)}
                      </span>
                      {m.our_assist_champion_id
                        ? ` + ${championNameById(champions, m.our_assist_champion_id)}`
                        : ""}
                      <span className="text-text-muted"> vs </span>
                      <span className="font-semibold">{m.opponent_name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => startEditMatch(idx)}
                        className="px-2 py-1 rounded bg-[rgba(255,255,255,0.03)] text-sm"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          await handleDeleteMatch(idx);
                        }}
                        className="px-2 py-1 rounded bg-[rgba(255,255,255,0.03)] text-sm text-rose-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {showMatchEditor && (
              <div className="rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3">
                <div className="grid grid-cols-1 md:grid-cols-1 gap-3 mb-2">
                  <div>
                    <label className="block text-sm text-text-muted mb-1">
                      Main Champion
                    </label>
                    <select
                      className="w-full h-10 px-3 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                      value={matchDraft.our_main_champion_id}
                      onChange={(e) =>
                        setMatchDraft((prev) => ({
                          ...prev,
                          our_main_champion_id: e.target.value,
                          our_assist_champion_id:
                            prev.our_assist_champion_id === e.target.value
                              ? ""
                              : prev.our_assist_champion_id,
                        }))
                      }
                    >
                      <option value="">Select main champion</option>
                      {champions.map((ch) => (
                        <option key={ch.id} value={String(ch.id)}>
                          {ch.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-text-muted mb-1">
                      Assist
                    </label>
                    <select
                      className="w-full h-10 px-3 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                      value={matchDraft.our_assist_champion_id}
                      onChange={(e) =>
                        setMatchDraft((prev) => ({
                          ...prev,
                          our_assist_champion_id: e.target.value,
                        }))
                      }
                    >
                      <option value="">Optional</option>
                      {availableAssistChampions.map((ch) => (
                        <option key={ch.id} value={String(ch.id)}>
                          {ch.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="mb-2">
                      <div className="text-sm text-text-muted mb-1">Match Result</div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setMatchDraft((p) => ({ ...p, result: 'win' }))}
                          className={`px-3 py-2 rounded ${matchDraft.result === 'win' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-[rgba(255,255,255,0.03)] text-text-muted'}`}
                        >
                          Win
                        </button>
                        <button
                          type="button"
                          onClick={() => setMatchDraft((p) => ({ ...p, result: 'loss' }))}
                          className={`px-3 py-2 rounded ${matchDraft.result === 'loss' ? 'bg-rose-700 text-white border-rose-700' : 'bg-[rgba(255,255,255,0.03)] text-text-muted'}`}
                        >
                          Loss
                        </button>
                      </div>
                    </div>

                    <div className="mb-2">
                      <label className="block text-sm text-text-muted mb-1">Opponent name</label>
                      <input
                        type="text"
                        placeholder="Enter opponent name"
                        className="w-full px-3 py-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)] mb-2"
                        value={matchDraft.opponent_name}
                        onChange={(e) => setMatchDraft((p) => ({ ...p, opponent_name: e.target.value }))}
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-sm text-text-muted mb-1">Opponent Main</label>
                        <select
                          value={matchDraft.opponent_main_champion_id}
                          onChange={(e) => setMatchDraft((p) => ({ ...p, opponent_main_champion_id: e.target.value, opponent_assist_champion_id: p.opponent_assist_champion_id === e.target.value ? '' : p.opponent_assist_champion_id }))}
                          className="w-full h-10 px-3 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                        >
                          <option value="">Optional</option>
                          {champions.map((ch) => (
                            <option key={ch.id} value={String(ch.id)}>{ch.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm text-text-muted mb-1">Opponent Assist</label>
                        <select
                          value={matchDraft.opponent_assist_champion_id}
                          onChange={(e) => setMatchDraft((p) => ({ ...p, opponent_assist_champion_id: e.target.value }))}
                          className="w-full h-10 px-3 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                        >
                          <option value="">Optional</option>
                          {champions.filter((c) => String(c.id) !== String(matchDraft.opponent_main_champion_id || '')).map((ch) => (
                            <option key={ch.id} value={String(ch.id)}>{ch.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="mt-3">
                      <label className="block text-sm text-text-muted mb-1">Match Notes</label>
                      <textarea
                        rows={4}
                        className="w-full px-3 py-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.08)]"
                        value={matchDraft.notes}
                        onChange={(e) => setMatchDraft((p) => ({ ...p, notes: e.target.value }))}
                      />
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-3">
                      <button type="button" onClick={cancelMatchEdit} className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.06)] text-sm">Cancel</button>
                      <button type="button" onClick={() => { saveMatch() }} className="px-4 py-2 rounded bg-[var(--color-accent-primary, #2563eb)] text-white text-sm">Save Match</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <div className="mb-3">
              <div className="text-sm text-text-muted">Routine</div>
              <div className="mt-2 text-sm">
                <div><span className="font-semibold">Date:</span> {draft.happened_on || '—'}</div>
                <div><span className="font-semibold">Kind:</span> {draft.kind}</div>
                {draft.notes ? <div className="mt-1"><span className="font-semibold">Notes:</span> {draft.notes}</div> : null}
              </div>
            </div>

            <div>
              <div className="text-sm text-text-muted mb-2">Matches</div>
              {matches.length === 0 ? (
                <div className="text-sm text-text-muted">No matches added.</div>
              ) : (
                <div className="space-y-2 max-h-[240px] overflow-y-auto pr-1">
                  {matches.map((m, idx) => (
                    <div key={m._localId || idx} className="rounded border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.02)] p-3 flex items-center justify-between">
                      <div className="text-sm">
                        <div>
                          <span className="font-semibold">{championNameById(champions, m.our_main_champion_id)}</span>
                          {m.our_assist_champion_id ? ` + ${championNameById(champions, m.our_assist_champion_id)}` : ''}
                          <span className="text-text-muted"> vs </span>
                          <span className="font-semibold">{m.opponent_name || '—'}</span>
                        </div>
                        <div className="text-text-muted text-sm mt-1">{m.played_at ? `Played at ${m.played_at}` : ''}{m.notes ? ` — ${m.notes}` : ''}</div>
                      </div>
                      <div className="text-sm font-semibold">
                        {m.result ? m.result.charAt(0).toUpperCase() + m.result.slice(1) : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="mt-3 border-t border-[rgba(255,255,255,0.04)] pt-3 flex items-center justify-between gap-3">
        <div>
          <button type="button" onClick={() => { if (!saving) handleCancel() }} className="px-3 py-1 rounded bg-[transparent] border border-[rgba(255,255,255,0.06)] text-sm">Cancel</button>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" onClick={handleBack} disabled={step === 1 || saving} className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)] text-sm disabled:opacity-40">Back</button>
          <button type="button" onClick={handleNext} disabled={saving} className="px-3 py-1 rounded bg-[rgba(255,255,255,0.06)] text-sm">
            {step < totalSteps ? 'Next' : (saving ? 'Saving...' : 'Save Routine')}
          </button>
        </div>
      </div>
    </div>
  </div>
)};