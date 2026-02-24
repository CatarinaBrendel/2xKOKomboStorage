import React, { useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'

function Wizard({ steps = [], data = {}, onChange = () => {}, onFinish = () => {}, onCancel = () => {}, currentImageUrl = null, championsList = [] }){
  const [stepIndex, setStepIndex] = useState(0)
  const [local, setLocal] = useState(data)

  useEffect(() => setLocal(data), [data])

  const step = steps[stepIndex]

  function update(updates){
    const next = { ...local, ...updates }
    setLocal(next)
    onChange(next)
  }

  return (
    <div className="flex-1 flex flex-col">
      <div className="mb-3 flex items-center gap-2">
        {steps.map((s, i) => (
          <div key={s} className={`px-2 py-1 rounded text-sm ${i === stepIndex ? 'bg-[var(--color-accent-primary)] text-white' : 'bg-[rgba(255,255,255,0.02)] text-text-muted'}`}>{s}</div>
        ))}
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
              <textarea className="w-full h-full min-h-[220px] p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)]" value={local.notes||''} onChange={(e) => update({ notes: e.target.value })} />
            </div>
          </div>
        )}

        {step === 'Combos' && (
          <div>
            <p className="text-text-muted mb-2">Add default combos; choose a Fuse for each.</p>
            {(() => {
              const fuseOptions = [
                '2x Assist',
                'Double Down',
                'Freestyle',
                'Juggernaut',
                'Sidekick'
              ]
              const asArray = Array.isArray(local.combos)
                ? local.combos
                : (local.combos ? String(local.combos).split('\n').map((l) => ({ line: l, fuse: 'Freestyle', name: '', ranking: null, assist: '' })) : [])

              function setCombos(next) { update({ combos: next }) }

              return (
                <div className="space-y-2">
                  {asArray.length === 0 && (
                    <div className="flex items-center gap-2">
                      <div className="text-text-muted">No combos yet.</div>
                      <button type="button" onClick={() => { const copy = asArray.slice(); copy.push({ line: '', fuse: 'Freestyle' }); setCombos(copy) }} className="px-2 py-1 rounded bg-[var(--color-accent-primary)] text-white text-sm">Add combo</button>
                    </div>
                  )}

                  {asArray.map((cmb, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="flex flex-col gap-1 flex-1">
                        <input className="w-full p-1 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)] text-sm" value={cmb.name||''} onChange={(e) => { const copy = asArray.slice(); copy[idx] = { ...copy[idx], name: e.target.value }; setCombos(copy) }} placeholder="Combo name (optional)" />
                        <textarea rows={2} className="w-full p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)]" value={cmb.line||''} onChange={(e) => {
                          const copy = asArray.slice(); copy[idx] = { ...copy[idx], line: e.target.value }
                          setCombos(copy)
                        }} placeholder="Combo line" />
                      </div>

                      <div className="flex flex-col gap-1 w-36">
                        <select className="p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)] text-sm" value={cmb.fuse||'Freestyle'} onChange={(e) => {
                          const copy = asArray.slice(); copy[idx] = { ...copy[idx], fuse: e.target.value }
                          setCombos(copy)
                        }}>
                          {fuseOptions.map((f) => (<option key={f} value={f}>{f}</option>))}
                        </select>
                        <div className="flex gap-2">
                          <input type="number" className="w-1/2 p-1 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)] text-sm" value={cmb.ranking!=null?cmb.ranking:''} onChange={(e) => { const copy = asArray.slice(); const v = e.target.value === '' ? null : parseInt(e.target.value, 10); copy[idx] = { ...copy[idx], ranking: v }; setCombos(copy) }} placeholder="Rank" />
                          {(() => {
                            const selectedAssistId = (() => {
                              if (!cmb || !cmb.assist) return ''
                              const byId = championsList.find(x => x.id === cmb.assist)
                              if (byId) return byId.id
                              const byName = championsList.find(x => x.name === cmb.assist)
                              if (byName) return byName.id
                              return ''
                            })()

                            return (
                              <select className="w-1/2 p-1 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)] text-sm" value={selectedAssistId} onChange={(e) => { const copy = asArray.slice(); copy[idx] = { ...copy[idx], assist: e.target.value }; setCombos(copy) }}>
                                <option value="">— none —</option>
                                {championsList && championsList.length > 0 && championsList.map((c) => (
                                  <option key={c.id} value={c.id}>{c.name}</option>
                                ))}
                              </select>
                            )
                          })()}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => { const copy = asArray.slice(); copy.splice(idx+1,0,{ line: '', fuse: 'Freestyle', name: '', ranking: null, assist: '' }); setCombos(copy) }}
                          className="w-8 h-8 flex items-center justify-center rounded bg-[var(--color-accent-primary)] text-white text-sm"
                          title="add combo"
                          aria-label="add combo"
                        >
                          +
                        </button>

                        <button
                          type="button"
                          title="remove"
                          aria-label="remove combo"
                          onClick={() => { const copy = asArray.slice(); copy.splice(idx,1); setCombos(copy) }}
                          className="w-8 h-8 flex items-center justify-center rounded bg-rose-600 text-white text-sm"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}

        {step === 'Abilities' && (
          <div>
            <p className="text-text-muted mb-2">Add ability notes (placeholder).</p>
            <textarea className="w-full p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)]" value={local.abilities||''} onChange={(e) => update({ abilities: e.target.value })} />
          </div>
        )}

        {step === 'Strategy' && (
          <div>
            <p className="text-text-muted mb-2">Strategy tips and notes.</p>
            <textarea className="w-full p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)] min-h-[300px]" value={local.strategy||''} onChange={(e) => update({ strategy: e.target.value })} />
          </div>
        )}

        {step === 'Teams' && (
          <div>
            <p className="text-text-muted mb-2">Team presets (placeholder).</p>
            <textarea className="w-full p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)]" value={local.teams||''} onChange={(e) => update({ teams: e.target.value })} />
          </div>
        )}

        {step === 'Matchups' && (
          <div>
            <p className="text-text-muted mb-2">Matchup counters and notes.</p>
            <textarea className="w-full p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)]" value={local.matchups||''} onChange={(e) => update({ matchups: e.target.value })} />
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div>
          <button type="button" onClick={() => { setStepIndex(Math.max(0, stepIndex-1)) }} className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)] mr-2">Back</button>
          <button type="button" onClick={() => { setStepIndex(Math.min(steps.length-1, stepIndex+1)) }} className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)]">Next</button>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={onCancel} className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)]">Cancel</button>
          {stepIndex === steps.length-1 ? (
            <button type="button" onClick={() => onFinish(local)} className="px-3 py-1 rounded bg-[var(--color-accent-primary)] text-white">Finish</button>
          ) : (
            <div className="text-sm text-text-muted">Step {stepIndex+1} / {steps.length}</div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function AddChampionModal({ show, onClose, newChampion, setNewChampion, championsList = [], championImages = {}, onFinish }){
  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black opacity-60" onClick={onClose} />
      <div className="relative z-10 w-[725px] min-h-[525px] max-h-[525px] bg-[var(--color-bg-panel)] border border-[var(--color-bg-border)] rounded p-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">Add Champion</h3>
          <button type="button" className="p-1 rounded hover:bg-[rgba(255,255,255,0.02)]" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <Wizard
          steps={["Overview","Combos","Abilities","Strategy","Teams","Matchups"]}
          data={newChampion}
          onChange={(nextData) => setNewChampion(nextData)}
          currentImageUrl={ newChampion && newChampion.id ? championImages[newChampion.id] : null }
          championsList={championsList}
          onFinish={onFinish}
          onCancel={onClose}
        />
      </div>
    </div>
  )
}
