import React, { useState, useEffect, useRef } from 'react'
import DOMPurify from 'dompurify'
import getTauriModule from '../utils/tauri'
import ComboVisual from './ComboVisual'

function getChampionName(filename) {
  if (!filename) return ''
  const base = filename.replace(/\.[^/.]+$/, '')
  const matches = base.match(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g)
  if (!matches || matches.length === 0) return base
  return matches[matches.length - 1]
}

function FilterPill({children, active}){
  return (
    <button className={`px-3 py-1 rounded-full text-sm ${active? 'bg-[var(--color-accent-primary)] text-white' : 'bg-[rgba(255,255,255,0.03)] text-text-muted'}`}>
      {children}
    </button>
  )
}

function ChampionList({ champions = [], onEditChampion }){
  if (!champions || champions.length === 0) return null
  return (
    <div className="mb-4">
      <h3 className="text-sm text-text-muted mb-2">Champions</h3>
      <div className="flex gap-2 overflow-x-auto">
        {champions.map(c => (
          <button key={c.id} onClick={() => onEditChampion && onEditChampion(c.code)} className="flex-shrink-0 w-28 p-2 bg-[rgba(255,255,255,0.02)] rounded text-sm text-left">
            <div className="font-semibold">{c.name}</div>
            <div className="text-xs text-text-muted truncate">{c.code}</div>
          </button>
        ))}
      </div>
    </div>
  )
}

export default function Main({ selection, onEditChampion }){
  const [activeTab, setActiveTab] = useState('Overview')
  const [champions, setChampions] = useState([])
  const [activeChampion, setActiveChampion] = useState(null)
  const [activeChampionIcon, setActiveChampionIcon] = useState(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        const tauri = await getTauriModule()
        if (!tauri) return
        const res = await tauri.invoke('list_champions')
        if (!mounted) return
        if (Array.isArray(res)) setChampions(res)
      } catch (e) {
        console.debug('list_champions failed', e)
      }
    }
    load()
    // Re-register handler whenever `selection` changes so the handler closes over the
    // latest selection value. This ensures `fetchActiveChampion` runs for the current
    // main selection when champions are updated elsewhere.
    function handler() { load(); if (selection && selection.main) fetchActiveChampion(selection.main) }
    window.addEventListener('champions:changed', handler)
    return () => { mounted = false; window.removeEventListener('champions:changed', handler) }
  }, [selection])

  // track mounted state for async safety
  useEffect(() => {
    isMountedRef.current = true
    return () => { isMountedRef.current = false }
  }, [])

  // reusable champion loader
  async function fetchActiveChampion(code) {
    if (!code) {
      if (isMountedRef.current) {
        setActiveChampion(null)
        setActiveChampionIcon(null)
      }
      return
    }

    try {
      const tauri = await getTauriModule()
      if (!tauri) return
      let res = null
      try {
        res = await tauri.invoke('get_champion_by_code', { code })
      } catch (e) {
        try {
          const list = await tauri.invoke('list_champions')
          if (Array.isArray(list)) {
            const filenameNoExt = (code || '').replace(/\.[^/.]+$/, '')
            res = list.find(c => c.code === code || c.code === filenameNoExt || c.slug === filenameNoExt || c.name === code)
          }
        } catch (e2) {
          console.debug('fallback list_champions failed', e2)
        }
      }

      if (!isMountedRef.current) return
      if (res && res.name) {
        setActiveChampion(res)
        // fetch icon
        let iconPath = null
        if (res.images && Array.isArray(res.images)) {
          const icon = res.images.find(i => i.type === 'icon') || (res.icon ? res.icon : null)
          if (icon && icon.path) iconPath = icon.path
        } else if (res.icon && res.icon.path) {
          iconPath = res.icon.path
        }

        if (iconPath) {
          try {
            const url = await tauri.invoke('get_image_data', { filename: iconPath })
            if (isMountedRef.current) setActiveChampionIcon(url)
          } catch (e) {
            console.debug('get_image_data failed', e)
            if (isMountedRef.current) setActiveChampionIcon(null)
          }
        } else {
          if (isMountedRef.current) setActiveChampionIcon(null)
        }
      } else {
        if (isMountedRef.current) {
          setActiveChampion(null)
          setActiveChampionIcon(null)
        }
      }
    } catch (e) {
      console.debug('fetchActiveChampion failed', e)
      if (isMountedRef.current) {
        setActiveChampion(null)
        setActiveChampionIcon(null)
      }
    }
  }

  // When selection.main changes, fetch full champion record
  useEffect(() => {
    let mounted = true
    async function loadChampion() {
      if (!selection || !selection.main) {
        setActiveChampion(null)
        setActiveChampionIcon(null)
        return
      }

      try {
        const tauri = await getTauriModule()
        if (!tauri) return
        // Try direct fetch by code
        let res = null
        try {
          res = await tauri.invoke('get_champion_by_code', { code: selection.main })
        } catch (e) {
          // fallback: try list_champions and match
          try {
            const list = await tauri.invoke('list_champions')
            if (Array.isArray(list)) {
              const filenameNoExt = (selection.main || '').replace(/\.[^/.]+$/, '')
              res = list.find(c => c.code === selection.main || c.code === filenameNoExt || c.slug === filenameNoExt || c.name === selection.main)
            }
          } catch (e2) {
            console.debug('fallback list_champions failed', e2)
          }
        }

        if (!mounted) return
        if (res && res.name) {
          setActiveChampion(res)
          // fetch icon data if present
          if (res.images && Array.isArray(res.images)) {
            const icon = res.images.find(i => i.type === 'icon') || (res.icon ? res.icon : null)
            if (icon && icon.path) {
              try {
                const url = await tauri.invoke('get_image_data', { filename: icon.path })
                if (mounted) setActiveChampionIcon(url)
              } catch (e) {
                console.debug('get_image_data failed', e)
                if (mounted) setActiveChampionIcon(null)
              }
            } else {
              setActiveChampionIcon(null)
            }
          } else if (res.icon && res.icon.path) {
            try {
              const url = await tauri.invoke('get_image_data', { filename: res.icon.path })
              if (mounted) setActiveChampionIcon(url)
            } catch (e) {
              console.debug('get_image_data failed', e)
              if (mounted) setActiveChampionIcon(null)
            }
          } else {
            setActiveChampionIcon(null)
          }
        } else {
          setActiveChampion(null)
          setActiveChampionIcon(null)
        }
      } catch (e) {
        console.debug('loadChampion failed', e)
        setActiveChampion(null)
        setActiveChampionIcon(null)
      }
    }
    loadChampion()
    return () => { mounted = false }
  }, [selection && selection.main])

  const tabs = ['Overview', 'Combos', 'Abilities', 'Strategy', 'Teams', 'Matchups']
  if (!selection || !selection.main) {
    return (
      <main className="flex-1 p-6 overflow-auto">
        

        <div className="h-[60vh] flex items-center justify-center card">
          <div className="text-center p-8">
            <div className="mb-6">
              <div className="w-40 h-40 rounded-full mx-auto bg-[rgba(255,255,255,0.02)] flex items-center justify-center text-3xl text-text-muted">⭘</div>
            </div>
            <h2 className="text-2xl font-semibold mb-2">No combos yet</h2>
            <p className="text-text-muted mb-4">Select a main character to view combos or create a new combo.</p>
            <div className="flex items-center justify-center">
              <button className="btn btn-primary">Create Combo</button>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="flex-1 p-6 overflow-auto">
      

      {/* Sub-menu tabs */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded ${activeTab === tab ? 'bg-[var(--color-accent-primary)] text-white' : 'bg-[rgba(255,255,255,0.02)] text-text-muted'}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {selection && selection.main ? (
          <div className="ml-4">
            <button
              type="button"
              onClick={() => { if (onEditChampion) onEditChampion(selection.main); else console.log('Edit champion', selection.main) }}
              title="Edit champion"
              className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.04)] flex items-center gap-2"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-text-muted">
                <path d="M12 20h9" />
                <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L8 18l-4 1 1-4 11.5-11.5z" />
              </svg>
              <span className="text-sm text-text-muted">Edit</span>
            </button>
          </div>
        ) : (
          <div />
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'Overview' && (
        <div className="card p-6">
          <div className="flex items-start gap-6">
            <div>
              <div className="w-28 h-28 rounded-md bg-[rgba(255,255,255,0.02)] overflow-hidden flex items-center justify-center">
                {activeChampionIcon ? (
                  <img src={activeChampionIcon} alt={activeChampion && activeChampion.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="text-xl text-text-muted">⭘</div>
                )}
              </div>
            </div>
            <div className="flex-1">
              <h2 className="text-2xl font-semibold mb-1">{activeChampion ? activeChampion.name : getChampionName(selection.main)}</h2>
              <div className="text-sm text-text-muted mb-3">{activeChampion ? (activeChampion.code || '') : selection.main}</div>
              <div className="mb-3">
                <strong className="text-sm">Role:</strong> <span className="text-sm text-text-muted">{activeChampion && activeChampion.type ? activeChampion.type : '—'}</span>
              </div>
              {/* Strategy intentionally omitted from Overview; shown in Strategy tab */}
              <div className="mt-4">
                <div className="border-t border-[rgba(255,255,255,0.04)] pt-4">
                  <div className="text-sm text-text-muted font-semibold mb-4">NOTES</div>

                  {activeChampion && activeChampion.metadata && activeChampion.metadata.notes ? (
                    (() => {
                      const raw = String(activeChampion.metadata.notes || '')

                      // If the stored notes already contain HTML tags, sanitize and render them.
                      // If they are plain text (no tags) keep the previous line-splitting list behavior.
                      // Also handle the case where HTML was double-encoded (contains &lt; or &amp;lt;).
                      let htmlToRender = null
                      if (raw.includes('<')) {
                        htmlToRender = DOMPurify.sanitize(raw)
                      } else if (raw.includes('&lt;')) {
                        // decode HTML entities, then sanitize
                        const decoded = (typeof window !== 'undefined') ? new DOMParser().parseFromString(raw, 'text/html').documentElement.textContent : raw
                        htmlToRender = DOMPurify.sanitize(decoded)
                      }

                      if (htmlToRender) {
                        return (
                          <div className="prose prose-invert text-sm text-[rgba(255,255,255,0.9)] leading-relaxed max-w-none" dangerouslySetInnerHTML={{ __html: htmlToRender }} />
                        )
                      }

                      const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
                      return (
                        <ul className="space-y-4">
                          {lines.map((ln, idx) => (
                            <li key={idx} className="flex items-start gap-4">
                              <span className="flex-shrink-0 mt-1 w-2 h-2 rounded-full bg-sky-400" />
                              <div className="text-sm text-[rgba(255,255,255,0.75)] leading-relaxed">{ln}</div>
                            </li>
                          ))}
                        </ul>
                      )
                    })()
                  ) : (
                    <div className="text-sm text-text-muted">No notes.</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Combos' && (
        selection && selection.main ? (
          <div className="card p-6">
            <h2 className="text-2xl font-semibold mb-2">Combos for {activeChampion ? activeChampion.name : getChampionName(selection.main)}</h2>
            {selection.assist ? (
              <p className="text-sm text-text-muted mb-4">Filtering combos that include assist {getChampionName(selection.assist)}</p>
            ) : (
              <p className="text-sm text-text-muted mb-4">Showing all combos for {activeChampion ? activeChampion.name : getChampionName(selection.main)}</p>
            )}

            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FilterPill active>Combo</FilterPill>
                <FilterPill>Blockstring</FilterPill>
                <FilterPill>Setup</FilterPill>
                <FilterPill>Beginner</FilterPill>
                <FilterPill>Advanced</FilterPill>
              </div>
              <div className="flex items-center gap-3 text-text-muted">
                <span>Sort by:</span>
                <select className="bg-[transparent] border border-[rgba(255,255,255,0.04)] rounded p-1 text-sm">
                  <option>Most Recent</option>
                  <option>Alphabetical</option>
                </select>
              </div>
            </div>

            <div className="space-y-3">
              {(() => {
                // Prefer combos returned from DB (activeChampion.combos), falling back to metadata.combos
                const dbCombos = activeChampion && activeChampion.combos && Array.isArray(activeChampion.combos) ? activeChampion.combos : null
                const metaCombos = activeChampion && activeChampion.metadata && activeChampion.metadata.combos ? (Array.isArray(activeChampion.metadata.combos) ? activeChampion.metadata.combos : String(activeChampion.metadata.combos).split('\n')) : null
                const list = dbCombos || metaCombos || []

                if (list.length === 0) {
                  return (
                    <div className="p-3 text-text-muted flex items-center justify-between">
                      <div>No combos available for this champion.</div>
                      <button className="px-3 py-1 rounded bg-[var(--color-accent-primary)] text-white" onClick={() => { if (onEditChampion) onEditChampion(selection.main) }}>Add combo</button>
                    </div>
                  )
                }

                return list.map((c, i) => {
                  const line = typeof c === 'string' ? c : (c && c.line ? c.line : '')
                  const fuse = c && (c.fuse || c.fuse_type) ? (c.fuse || c.fuse_type) : null
                  const comboName = c && (c.name || c.title) ? (c.name || c.title) : null
                  const ranking = c && (c.rating || c.rank) ? (c.rating || c.rank) : null
                  const assistRaw = c && (c.assist || c.assist_name) ? (c.assist || c.assist_name) : null

                  // resolve assist id to champion name if possible
                  let assistName = null
                  if (assistRaw) {
                    const found = champions && champions.find(ch => ch.id === String(assistRaw) || ch.code === String(assistRaw) || ch.name === String(assistRaw))
                    assistName = found ? found.name : assistRaw
                  }

                  return (
                    <div key={i} className="p-3 bg-[rgba(255,255,255,0.02)] rounded">
                      <div className="flex items-start justify-between mb-2">
                        <div className="text-sm font-semibold">{comboName || `Combo ${i+1}`}</div>
                        <div className="flex items-center gap-2">
                          {ranking !== null && (
                            <div className="text-xs px-2 py-0.5 rounded bg-[rgba(255,255,255,0.03)]">Rank {ranking}</div>
                          )}
                          {fuse && (
                            <div className="text-sm font-semibold px-3 py-1 rounded bg-[rgba(255,255,255,0.04)] text-yellow-300">{fuse}</div>
                          )}
                        </div>
                      </div>

                      <div className="mb-2 text-xs text-text-muted flex items-center gap-4">
                        <div><strong>Main:</strong> {activeChampion ? (activeChampion.name || getChampionName(selection.main)) : getChampionName(selection.main)}</div>
                        <div><strong>Assist:</strong> {assistName || '—'}</div>
                      </div>

                      <ComboVisual line={line} />
                    </div>
                  )
                })
              })()}
            </div>
          </div>
        ) : (
          <div className="h-[60vh] flex items-center justify-center card">
            <div className="text-center p-8">
              <div className="mb-6">
                <div className="w-40 h-40 rounded-full mx-auto bg-[rgba(255,255,255,0.02)] flex items-center justify-center text-3xl text-text-muted">⭘</div>
              </div>
              <h2 className="text-2xl font-semibold mb-2">No combos yet</h2>
              <p className="text-text-muted mb-4">Select a main character to view combos or create a new combo.</p>
              <div className="flex items-center justify-center">
                <button className="btn btn-primary">Create Combo</button>
              </div>
            </div>
          </div>
        )
      )}

      {activeTab === 'Abilities' && (
        <div className="card p-6">
          <h2 className="text-2xl font-semibold mb-2">Abilities</h2>
          <p className="text-text-muted">Abilities and descriptions will be shown here.</p>
        </div>
      )}

      {activeTab === 'Strategy' && (
        <div className="card p-6">
          <h2 className="text-2xl font-semibold mb-2">Strategy</h2>
          {(() => {
            const raw = activeChampion && activeChampion.strategy ? String(activeChampion.strategy) : ''
            const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
            const intro = lines.length > 0 ? lines[0] : 'No strategy notes.'
            const items = lines.length > 1 ? lines.slice(1) : []

            return (
              <>
                <div className="text-base text-[rgba(255,255,255,0.75)] mb-4">{intro}</div>
                {items.length > 0 ? (
                  <ul className="list-disc pl-6 space-y-4">
                    {items.map((it, idx) => (
                      <li key={idx} className="text-sm text-[rgba(255,255,255,0.85)] leading-relaxed">{it}</li>
                    ))}
                  </ul>
                ) : null}
              </>
            )
          })()}
        </div>
      )}

      {activeTab === 'Teams' && (
        <div className="card p-6">
          <h2 className="text-2xl font-semibold mb-2">Teams</h2>
          <p className="text-text-muted">Team building tools and presets.</p>
        </div>
      )}

      {activeTab === 'Matchups' && (
        <div className="card p-6">
          <h2 className="text-2xl font-semibold mb-2">Matchups</h2>
          <p className="text-text-muted">Matchup data and counters.</p>
        </div>
      )}
    </main>
  )
}
