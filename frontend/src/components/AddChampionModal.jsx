import React, { useEffect, useRef, useState } from 'react'
import RichTextEditor from './RichTextEditor'
import { Trash2 } from 'lucide-react'

function Wizard({ steps = [], data = {}, onChange = () => {}, onFinish = () => {}, onDelete = () => {}, onCancel = () => {}, currentImageUrl = null, championsList = [] }){
  const [stepIndex, setStepIndex] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)
  const [showDeleteConfirmModal, setShowDeleteConfirmModal] = useState(false)
  const [local, setLocal] = useState({
    name: '',
    key: '',
    role: '',
    notes: '',
    combos: [],
    abilities: '',
    strategy: '',
    teams: '',
    matchups: '',
    imagePreview: null,
    ...data
  })
  const [tagInputs, setTagInputs] = useState({})
  const WizardSyncPrev = useRef(null)

  useEffect(() => {
    // merge incoming data with sensible defaults so inputs are populated when
    // a new champion is opened for editing (guard to avoid stomping local edits)
    const incomingRole = (data && (data.role || data.type)) ? (data.role || data.type) : undefined
    const incomingKey = data && (data.key || data.code || '')
    const incomingId = data && data.id

    // track previous identity to only sync when identity changes
    if (!WizardSyncPrev.current) WizardSyncPrev.current = { id: null, key: null }
    const prev = WizardSyncPrev.current

    const shouldSync = (incomingId && incomingId !== prev.id) || (!incomingId && incomingKey && incomingKey !== prev.key)
    if (shouldSync) {
      setLocal(prevLocal => ({
        name: '', key: '', role: '', notes: '', combos: [], abilities: '', strategy: '', teams: '', matchups: '', imagePreview: null,
        ...prevLocal,
        ...data,
        ...(incomingRole !== undefined ? { role: incomingRole } : {})
      }))
      WizardSyncPrev.current = { id: incomingId || null, key: incomingKey || null }
    }
  }, [data])

  const step = steps[stepIndex]

  function update(updates){
    const next = { ...local, ...updates }
    setLocal(next)
    try { console.debug('Wizard.update', updates) } catch (e) {}
  }

  async function handleDelete() {
    if (!local || !local.id) return

    setShowDeleteConfirmModal(true)
  }

  async function confirmDeleteChampion() {
    if (!local || !local.id) return

    setIsDeleting(true)
    try {
      await onDelete(local)
    } catch (e) {
      console.error('modal delete failed', e)
    } finally {
      setIsDeleting(false)
      setShowDeleteConfirmModal(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="mb-3">
        <div className="flex items-center justify-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className={`px-2 py-1 rounded text-sm ${i === stepIndex ? 'bg-[var(--color-accent-primary)] text-white' : 'bg-[rgba(255,255,255,0.02)] text-text-muted'}`}>{s}</div>
        ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto p-2">
        {step === 'Overview' && (
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1 space-y-2">
              <div>
                <label className="block text-xs text-text-muted">Name</label>
                <input className="w-full p-1 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)]" value={local.name||''} onChange={(e) => update({ name: e.target.value })} />
              </div>

              <div>
                <label className="block text-xs text-text-muted">Role</label>
                <input className="w-full p-1 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)]" value={local.role||''} onChange={(e) => update({ role: e.target.value })} />
              </div>

              <div>
                <label className="block text-xs text-text-muted">Image</label>
                <div className="mb-2">
                  {local.imagePreview ? (
                    <img src={local.imagePreview} alt="preview" className="w-24 h-24 object-cover rounded" />
                  ) : currentImageUrl ? (
                    <img src={currentImageUrl} alt="current" className="w-24 h-24 object-cover rounded" />
                  ) : (
                    <div className="w-24 h-24 bg-[rgba(255,255,255,0.02)] rounded flex items-center justify-center text-text-muted">No image</div>
                  )}
                </div>
                <input type="file" accept="image/*" onChange={async (e) => {
                  const f = e.target.files && e.target.files[0]
                  if (!f) return
                  try {
                    const buf = await f.arrayBuffer()
                    const arr = Array.from(new Uint8Array(buf))
                    const blob = new Blob([new Uint8Array(buf)], { type: f.type })
                    const preview = URL.createObjectURL(blob)
                    update({ imageBytes: arr, imageFilename: f.name, imagePreview: preview })
                  } catch (err) {
                    console.error('file read error', err)
                  }
                }} />
              </div>
            </div>

            <div className="col-span-2">
              <label className="block text-xs text-text-muted">Notes</label>
              <RichTextEditor value={local.notes||''} onChange={(val) => update({ notes: val })} placeholder="Notes — use the toolbar to add headers, paragraphs, lists and links" minHeight={320} />
            </div>
          </div>
        )}

        {step === 'Combos' && (
          <div>
            <p className="text-text-muted mb-2">Add default combos; choose a Fuse for each.</p>

            {(() => {
              const fuseOptions = ['2x Assist','Double Down','Freestyle','Juggernaut','Sidekick']
              const asArray = Array.isArray(local.combos)
                ? local.combos
                : (local.combos ? String(local.combos).split('\n').map((l) => ({ line: l, fuse: 'Freestyle', name: '', ranking: null, assist: '' })) : [])

              function setCombos(next) { update({ combos: next }) }

              return (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="text-text-muted">{asArray.length} combos</div>
                    <div>
                      <button type="button" onClick={() => { const copy = asArray.slice(); copy.push({ line: '', fuse: 'Freestyle', name: '', ranking: null, assist: null, tags: [] }); setCombos(copy) }} className="px-3 py-1 rounded bg-[var(--color-accent-primary)] text-white text-sm">+ Combo</button>
                    </div>
                  </div>

                  <div className="max-h-[330px] overflow-y-auto pr-2">
                    <div className="grid grid-cols-1 gap-3 mt-2">
                      {asArray.map((cmb, idx) => {
                        const tags = Array.isArray(cmb.tags) ? cmb.tags : (cmb.tags ? String(cmb.tags).split(',').map(t => t.trim()).filter(Boolean) : [])
                        const selectedAssistId = cmb && cmb.assist ? cmb.assist : ''

                        return (
                          <div key={idx} className="border border-[rgba(255,255,255,0.04)] rounded p-3 flex items-start gap-4 bg-[rgba(255,255,255,0.01)]">
                            <div className="flex-1">
                              <input className="w-full p-2 mb-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)] text-sm" value={cmb.name||''} onChange={(e) => { const copy = asArray.slice(); copy[idx] = { ...copy[idx], name: e.target.value }; setCombos(copy) }} placeholder="Title (optional)" />
                              <textarea rows={3} className="w-full p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)] text-sm" value={cmb.line||''} onChange={(e) => { const copy = asArray.slice(); copy[idx] = { ...copy[idx], line: e.target.value }; setCombos(copy) }} placeholder="Combo string" />

                              <div className="mt-2 w-full">
                                <div className="flex items-center gap-4 w-full">
                                  <div className="flex items-center flex-wrap gap-2 p-1 rounded border border-[rgba(255,255,255,0.04)] flex-1 min-w-0">
                                    {tags.map((t, ti) => (
                                      <div key={ti} className="flex items-center gap-2 bg-[rgba(255,255,255,0.03)] rounded px-2 py-0.5 text-sm">
                                        <div className="text-text-muted">{t}</div>
                                        <button type="button" title="Remove tag" onClick={() => { const copy = asArray.slice(); const cur = Array.isArray(copy[idx].tags) ? copy[idx].tags.slice() : (copy[idx].tags ? String(copy[idx].tags).split(',').map(x=>x.trim()).filter(Boolean) : []); cur.splice(ti,1); copy[idx] = { ...copy[idx], tags: cur }; setCombos(copy) }} className="text-text-muted">✕</button>
                                      </div>
                                    ))}

                                    <input
                                      className="flex-1 min-w-[120px] p-1 bg-[transparent] outline-none text-sm"
                                      placeholder="Add tag and press Enter"
                                      value={tagInputs[idx]||''}
                                      onChange={(e) => setTagInputs({ ...tagInputs, [idx]: e.target.value })}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault()
                                          const v = (tagInputs[idx] || '').trim()
                                          if (!v) return
                                          const parts = v.split(',').map(t => t.trim()).filter(Boolean)
                                          const copy = asArray.slice()
                                          const cur = Array.isArray(copy[idx].tags) ? copy[idx].tags.slice() : (copy[idx].tags ? String(copy[idx].tags).split(',').map(x=>x.trim()).filter(Boolean) : [])
                                          copy[idx] = { ...copy[idx], tags: Array.from(new Set(cur.concat(parts))) }
                                          setCombos(copy)
                                          setTagInputs({ ...tagInputs, [idx]: '' })
                                        }
                                      }}
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>

                            <div className="w-44 flex flex-col gap-2">
                              <select className="p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)] text-sm" value={cmb.fuse||'Freestyle'} onChange={(e) => { const copy = asArray.slice(); copy[idx] = { ...copy[idx], fuse: e.target.value }; setCombos(copy) }}>
                                {fuseOptions.map((f) => (<option key={f} value={f}>{f}</option>))}
                              </select>

                              <input type="number" className="w-full p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)] text-sm" value={cmb.ranking!=null?cmb.ranking:''} onChange={(e) => { const copy = asArray.slice(); const v = e.target.value === '' ? null : parseInt(e.target.value, 10); copy[idx] = { ...copy[idx], ranking: v }; setCombos(copy) }} placeholder="Rank" />

                              <select className="w-full p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)] text-sm" value={selectedAssistId} onChange={(e) => { const copy = asArray.slice(); copy[idx] = { ...copy[idx], assist: e.target.value }; setCombos(copy) }}>
                                <option value="">— none —</option>
                                {championsList && championsList.length > 0 && championsList.filter(c => !(local && local.id && String(c.id) === String(local.id))).map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>

                              <button type="button" title="Delete combo" aria-label="Delete combo" onClick={() => { const copy = asArray.slice(); copy.splice(idx,1); setCombos(copy) }} className="p-2 rounded hover:bg-[rgba(255,0,0,0.08)] text-rose-400 ml-auto mt-10">
                                <Trash2 size={20} />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        )}

        {step === 'Abilities' && (
          <div>
            <p className="text-text-muted mb-2">Add ability notes (use formatting toolbar).</p>
            <RichTextEditor value={local.abilities||''} onChange={(val) => update({ abilities: val })} placeholder="Ability notes" minHeight={180} />
          </div>
        )}

        {step === 'Strategy' && (
          <div>
            <p className="text-text-muted mb-2">Strategy tips and notes.</p>
            <RichTextEditor value={local.strategy||''} onChange={(val) => update({ strategy: val })} placeholder="Strategy notes" minHeight={420} />
          </div>
        )}

        {step === 'Teams' && (
          <div>
            <p className="text-text-muted mb-2">Team presets (use formatting to structure lists).</p>
            <RichTextEditor value={local.teams||''} onChange={(val) => update({ teams: val })} placeholder="Teams / presets" minHeight={180} />
          </div>
        )}

        {step === 'Matchups' && (
          <div>
            <p className="text-text-muted mb-2">Matchup counters and notes.</p>
            <RichTextEditor value={local.matchups||''} onChange={(val) => update({ matchups: val })} placeholder="Matchups" minHeight={180} />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <button type="button" onClick={() => { setStepIndex(Math.max(0, stepIndex-1)) }} className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)] mr-2">Back</button>
          <button type="button" onClick={() => { setStepIndex(Math.min(steps.length-1, stepIndex+1)) }} className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)]">Next</button>
        </div>
        <div className="flex items-center gap-2">
          {local && local.id ? (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className="px-3 py-1 rounded text-white disabled:opacity-60 bg-[var(--color-accent-danger)]"
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          ) : null}
          <button type="button" onClick={onCancel} className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)]">Cancel</button>
          {stepIndex === steps.length-1 ? (
            <button type="button" onClick={() => onFinish(local)} className="px-3 py-1 rounded bg-[var(--color-accent-primary)] text-white">Finish</button>
          ) : (
            <div className="text-sm text-text-muted">Step {stepIndex+1} / {steps.length}</div>
          )}
        </div>
      </div>

      {showDeleteConfirmModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => { if (!isDeleting) setShowDeleteConfirmModal(false) }} />
          <div className="relative z-10 w-[520px] max-w-[92vw] rounded border border-[var(--color-bg-border)] bg-[var(--color-bg-panel)] p-5">
            <h4 className="text-base font-semibold mb-3 text-rose-300">Confirm Delete</h4>
            <p className="text-sm text-text-muted leading-relaxed">
              Deleting {local && local.name ? local.name : 'this champion'} action can't be undone. Are you sure you want to continue?
            </p>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirmModal(false)}
                disabled={isDeleting}
                className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)] disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteChampion}
                disabled={isDeleting}
                className="px-3 py-1 rounded bg-[var(--color-accent-danger)] text-white disabled:opacity-60"
              >
                {isDeleting ? 'Deleting…' : 'Delete Champion'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function AddChampionModal({ show, onClose, newChampion, setNewChampion, championsList = [], championImages = {}, onFinish, onDelete }){
  if (!show) return null
  // try to resolve champion id from provided championsList using key/name so we can show thumbnail
  let resolvedImageUrl = null
  try {
    const key = newChampion && (newChampion.key || newChampion.code || '')
    const filenameNoExt = key ? String(key).replace(/\.[^/.]+$/, '') : ''
    const found = championsList && championsList.length > 0 ? championsList.find(c => c && (c.code === key || c.code === filenameNoExt || c.slug === filenameNoExt || c.name === (newChampion && newChampion.name))) : null
    if (found && found.id && championImages && championImages[found.id]) resolvedImageUrl = championImages[found.id]
    // fallback to explicit id on newChampion
    if (!resolvedImageUrl && newChampion && newChampion.id && championImages && championImages[newChampion.id]) resolvedImageUrl = championImages[newChampion.id]
  } catch (e) {
    // ignore
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black opacity-60" onClick={onClose} />
      <div className="relative z-10 w-[925px] min-h-[675px] max-h-[525px] bg-[var(--color-bg-panel)] border border-[var(--color-bg-border)] rounded p-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">{newChampion && (newChampion.id || (newChampion.key && String(newChampion.key).trim() !== '')) ? 'Edit Champion' : 'Add Champion'}</h3>
          <button type="button" className="p-1 rounded hover:bg-[rgba(255,255,255,0.02)]" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <Wizard
          key={newChampion && (newChampion.id || newChampion.key) ? String(newChampion.id || newChampion.key) : 'new'}
          steps={["Overview","Combos","Abilities","Strategy","Teams","Matchups"]}
          data={newChampion}
          onChange={(nextData) => setNewChampion(nextData)}
          currentImageUrl={ resolvedImageUrl }
          championsList={championsList}
          onFinish={onFinish}
          onDelete={onDelete}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}
