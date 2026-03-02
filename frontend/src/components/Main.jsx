import React, { useState, useEffect, useRef } from 'react'
import DOMPurify from 'dompurify'
import getTauriModule from '../utils/tauri'
import ComboVisual from './ComboVisual'
import NotesWorkspace from './NotesWorkspace'
import RichTextEditor from './RichTextEditor'

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

export default function Main({ selection }){
  const [activeTab, setActiveTab] = useState('Overview')
  const [champions, setChampions] = useState([])
  const [activeChampion, setActiveChampion] = useState(null)
  const [activeChampionIcon, setActiveChampionIcon] = useState(null)
  const [editingTab, setEditingTab] = useState(null)
  const [sectionDraft, setSectionDraft] = useState('')
  const [overviewDraft, setOverviewDraft] = useState({ name: '', role: '', notes: '' })
  const [comboDrafts, setComboDrafts] = useState([])
  const [isSavingSection, setIsSavingSection] = useState(false)
  const [sectionSaveError, setSectionSaveError] = useState('')
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

  const tabs = ['Overview', 'Combos', 'Abilities', 'Strategy', 'Teams', 'Matchups', 'Notes']
  const scrollableCardClass = 'card p-6 max-h-[calc(100vh-180px)] overflow-y-auto'
  const isCurrentTabEditable = ['Overview', 'Combos', 'Abilities', 'Strategy', 'Teams', 'Matchups'].includes(activeTab)
  const isEditingCurrentTab = editingTab === activeTab

  useEffect(() => {
    setEditingTab(null)
    setSectionDraft('')
    setOverviewDraft({ name: '', role: '', notes: '' })
    setComboDrafts([])
    setSectionSaveError('')
  }, [activeTab, activeChampion && activeChampion.id])

  function getChampionCombosList() {
    const dbCombos = activeChampion && activeChampion.combos && Array.isArray(activeChampion.combos) ? activeChampion.combos : null
    const metaCombos = activeChampion && activeChampion.metadata && activeChampion.metadata.combos
      ? (Array.isArray(activeChampion.metadata.combos) ? activeChampion.metadata.combos : String(activeChampion.metadata.combos).split('\n'))
      : null
    return dbCombos || metaCombos || []
  }

  function normalizeComboDraft(combo, idx) {
    if (typeof combo === 'string') {
      return {
        line: combo,
        fuse: 'Freestyle',
        sort_order: idx,
        name: '',
        ranking: null,
        assist: null,
      }
    }

    return {
      line: combo && combo.line ? String(combo.line) : '',
      fuse: combo && (combo.fuse || combo.fuse_type) ? String(combo.fuse || combo.fuse_type) : 'Freestyle',
      sort_order: (combo && typeof combo.sort_order === 'number') ? combo.sort_order : idx,
      name: combo && (combo.name || combo.title) ? String(combo.name || combo.title) : '',
      ranking: (combo && typeof combo.ranking === 'number')
        ? combo.ranking
        : ((combo && typeof combo.rank === 'number') ? combo.rank : null),
      assist: combo && (combo.assist || combo.assist_name) ? String(combo.assist || combo.assist_name) : null,
    }
  }

  function toNorm(value) {
    return String(value || '').trim().toLowerCase()
  }

  function resolveAssistCandidates(value) {
    if (!value) return []
    const raw = String(value).trim()
    if (!raw) return []

    const baseName = getChampionName(raw)
    const candidates = new Set([raw, baseName])

    const found = champions && champions.find((ch) => {
      const fields = [ch && ch.id, ch && ch.code, ch && ch.slug, ch && ch.name]
      return fields.some((field) => {
        const fieldNorm = toNorm(field)
        return fieldNorm && (fieldNorm === toNorm(raw) || fieldNorm === toNorm(baseName))
      })
    })

    if (found) {
      if (found.id) candidates.add(String(found.id))
      if (found.code) candidates.add(String(found.code))
      if (found.slug) candidates.add(String(found.slug))
      if (found.name) candidates.add(String(found.name))
    }

    return Array.from(candidates).map(toNorm).filter(Boolean)
  }

  function getVisibleCombos(combos) {
    const selectedAssist = selection && selection.assist ? String(selection.assist) : ''
    if (!selectedAssist) return combos

    const selectedAssistCandidates = resolveAssistCandidates(selectedAssist)
    return combos.filter((combo) => {
      const assistRaw = combo && (combo.assist || combo.assist_name) ? (combo.assist || combo.assist_name) : null
      if (!assistRaw) return false
      const comboAssistCandidates = resolveAssistCandidates(assistRaw)
      return comboAssistCandidates.some((candidate) => selectedAssistCandidates.includes(candidate))
    })
  }

  function beginInlineEdit() {
    setSectionSaveError('')

    if (activeTab === 'Combos') {
      setComboDrafts(getChampionCombosList().map((combo, idx) => normalizeComboDraft(combo, idx)))
      setEditingTab('Combos')
      return
    }

    if (activeTab === 'Overview') {
      setOverviewDraft({
        name: activeChampion && activeChampion.name ? String(activeChampion.name) : '',
        role: activeChampion && activeChampion.type ? String(activeChampion.type) : '',
        notes: activeChampion && activeChampion.metadata && activeChampion.metadata.notes ? String(activeChampion.metadata.notes) : '',
      })
      setEditingTab('Overview')
      return
    }

    if (activeTab === 'Abilities') setSectionDraft(activeChampion && activeChampion.metadata ? (activeChampion.metadata.abilities || '') : '')
    if (activeTab === 'Strategy') setSectionDraft(activeChampion ? (activeChampion.strategy || '') : '')
    if (activeTab === 'Teams') setSectionDraft(activeChampion && activeChampion.metadata ? (activeChampion.metadata.teams || '') : '')
    if (activeTab === 'Matchups') setSectionDraft(activeChampion && activeChampion.metadata ? (activeChampion.metadata.matchups || '') : '')

    setEditingTab(activeTab)
  }

  function cancelInlineEdit() {
    setEditingTab(null)
    setSectionDraft('')
    setOverviewDraft({ name: '', role: '', notes: '' })
    setComboDrafts([])
    setSectionSaveError('')
  }

  async function saveInlineEdit() {
    if (!activeChampion || !activeChampion.id) return

    setIsSavingSection(true)
    setSectionSaveError('')

    try {
      const tauri = await getTauriModule()
      if (!tauri) throw new Error('Tauri unavailable')

      if (activeTab === 'Combos') {
        const payload = comboDrafts
          .map((combo, idx) => ({
            line: combo && combo.line ? String(combo.line) : '',
            fuse: combo && combo.fuse ? String(combo.fuse) : 'Freestyle',
            sort_order: idx,
            name: combo && combo.name ? String(combo.name) : null,
            ranking: (combo && typeof combo.ranking === 'number') ? combo.ranking : null,
            assist: combo && combo.assist ? String(combo.assist) : null,
          }))
          .filter((combo) => combo.line.trim() !== '')

        await tauri.invoke('set_combos', {
          championId: String(activeChampion.id),
          combosJson: JSON.stringify(payload),
        })
      } else if (activeTab === 'Overview') {
        const metadata = {
          ...(activeChampion && activeChampion.metadata ? activeChampion.metadata : {}),
          notes: overviewDraft.notes,
        }

        await tauri.invoke('update_champion', {
          id: String(activeChampion.id),
          name: overviewDraft.name || activeChampion.name || '',
          code: activeChampion.code || (selection && selection.main ? selection.main : ''),
          slug: activeChampion.slug || String(overviewDraft.name || activeChampion.name || '').toLowerCase().replace(/\s+/g, '-'),
          ctype: overviewDraft.role || null,
          strategy: activeChampion.strategy || '',
          metadata: JSON.stringify(metadata),
        })
      } else {
        const metadata = {
          ...(activeChampion && activeChampion.metadata ? activeChampion.metadata : {}),
        }

        if (activeTab === 'Abilities') metadata.abilities = sectionDraft
        if (activeTab === 'Teams') metadata.teams = sectionDraft
        if (activeTab === 'Matchups') metadata.matchups = sectionDraft

        await tauri.invoke('update_champion', {
          id: String(activeChampion.id),
          name: activeChampion.name || '',
          code: activeChampion.code || (selection && selection.main ? selection.main : ''),
          slug: activeChampion.slug || String(activeChampion.name || '').toLowerCase().replace(/\s+/g, '-'),
          ctype: activeChampion.type || null,
          strategy: activeTab === 'Strategy' ? sectionDraft : (activeChampion.strategy || ''),
          metadata: JSON.stringify(metadata),
        })
      }

      await fetchActiveChampion(activeChampion.code || (selection && selection.main ? selection.main : ''))
      try {
        window.dispatchEvent(new Event('champions:changed'))
      } catch (e) {
        console.debug('failed to dispatch champions:changed', e)
      }

      cancelInlineEdit()
    } catch (e) {
      console.error('saveInlineEdit failed', e)
      setSectionSaveError('Could not save changes. Please try again.')
    } finally {
      setIsSavingSection(false)
    }
  }

  function renderRichSection(rawValue, emptyMessage) {
    const raw = rawValue ? String(rawValue || '') : ''

    let htmlToRender = null
    if (raw.includes('<')) {
      htmlToRender = DOMPurify.sanitize(raw)
    } else if (raw.includes('&lt;')) {
      const decoded = (typeof window !== 'undefined') ? new DOMParser().parseFromString(raw, 'text/html').documentElement.textContent : raw
      htmlToRender = DOMPurify.sanitize(decoded)
    }

    if (htmlToRender) {
      return (
        <div className="richtext-editor-content max-w-none" dangerouslySetInnerHTML={{ __html: htmlToRender }} />
      )
    }

    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      return <div className="text-base text-[rgba(255,255,255,0.75)]">{emptyMessage}</div>
    }

    return (
      <div className="richtext-editor-content max-w-none">
        {lines.map((line, idx) => (
          <p key={idx}>{line}</p>
        ))}
      </div>
    )
  }

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

        <div className="ml-4 flex items-center gap-2">
          {isCurrentTabEditable && !isEditingCurrentTab && (
            <button
              type="button"
              onClick={beginInlineEdit}
              className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.04)] text-sm text-text-muted"
            >
              Edit
            </button>
          )}
          {isCurrentTabEditable && isEditingCurrentTab && (
            <>
              <button
                type="button"
                onClick={cancelInlineEdit}
                disabled={isSavingSection}
                className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)] text-sm text-text-muted disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveInlineEdit}
                disabled={isSavingSection}
                className="px-3 py-1 rounded bg-[var(--color-accent-primary)] text-white text-sm disabled:opacity-60"
              >
                {isSavingSection ? 'Saving…' : 'Save'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab content */}
      {activeTab === 'Overview' && (
        <div className={scrollableCardClass}>
          {sectionSaveError && <div className="mb-3 text-sm text-rose-400">{sectionSaveError}</div>}
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
              {isEditingCurrentTab ? (
                <>
                  <input
                    className="w-full bg-transparent text-2xl font-semibold outline-none border border-[rgba(255,255,255,0.08)] rounded px-3 py-2 mb-2"
                    value={overviewDraft.name}
                    onChange={(e) => setOverviewDraft((prev) => ({ ...prev, name: e.target.value }))}
                    placeholder="Champion name"
                  />
                  <div className="text-sm text-text-muted mb-3">{activeChampion ? (activeChampion.code || '') : selection.main}</div>
                  <div className="mb-3 max-w-sm">
                    <label className="block text-xs text-text-muted mb-1">Role</label>
                    <input
                      className="w-full bg-transparent text-sm outline-none border border-[rgba(255,255,255,0.08)] rounded px-3 py-2"
                      value={overviewDraft.role}
                      onChange={(e) => setOverviewDraft((prev) => ({ ...prev, role: e.target.value }))}
                      placeholder="Role"
                    />
                  </div>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-semibold mb-1">{activeChampion ? activeChampion.name : getChampionName(selection.main)}</h2>
                  <div className="text-sm text-text-muted mb-3">{activeChampion ? (activeChampion.code || '') : selection.main}</div>
                  <div className="mb-3">
                    <strong className="text-sm">Role:</strong> <span className="text-sm text-text-muted">{activeChampion && activeChampion.type ? activeChampion.type : '—'}</span>
                  </div>
                </>
              )}
              {/* Strategy intentionally omitted from Overview; shown in Strategy tab */}
              <div className="mt-4">
                <div className="border-t border-[rgba(255,255,255,0.04)] pt-4">
                  <div className="text-sm text-text-muted font-semibold mb-4">NOTES</div>
                  {isEditingCurrentTab ? (
                    <RichTextEditor
                      value={overviewDraft.notes}
                      onChange={(val) => setOverviewDraft((prev) => ({ ...prev, notes: val }))}
                      placeholder="Notes"
                      minHeight={280}
                    />
                  ) : activeChampion && activeChampion.metadata && activeChampion.metadata.notes ? (
                    renderRichSection(activeChampion.metadata.notes, 'No notes.')
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
          <div className={scrollableCardClass}>
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

            {sectionSaveError && (
              <div className="mb-3 text-sm text-rose-400">{sectionSaveError}</div>
            )}

            {isEditingCurrentTab ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-text-muted">{comboDrafts.length} combos</div>
                  <button
                    type="button"
                    onClick={() => setComboDrafts((prev) => prev.concat({ line: '', fuse: 'Freestyle', sort_order: prev.length, name: '', ranking: null, assist: null }))}
                    className="px-3 py-1 rounded bg-[var(--color-accent-primary)] text-white text-sm"
                  >
                    + Combo
                  </button>
                </div>

                <div className="space-y-3">
                  {comboDrafts.map((combo, idx) => (
                    <div key={`draft-${idx}`} className="p-3 bg-[rgba(255,255,255,0.02)] rounded border border-[rgba(255,255,255,0.05)]">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <input
                          className="w-full p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.06)] text-sm"
                          value={combo.name || ''}
                          onChange={(e) => setComboDrafts((prev) => prev.map((row, i) => (i === idx ? { ...row, name: e.target.value } : row)))}
                          placeholder="Title (optional)"
                        />
                        <select
                          className="w-full p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.06)] text-sm"
                          value={combo.fuse || 'Freestyle'}
                          onChange={(e) => setComboDrafts((prev) => prev.map((row, i) => (i === idx ? { ...row, fuse: e.target.value } : row)))}
                        >
                          {['2x Assist', 'Double Down', 'Freestyle', 'Juggernaut', 'Sidekick'].map((fuse) => (
                            <option key={fuse} value={fuse}>{fuse}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          className="w-full p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.06)] text-sm"
                          value={combo.ranking != null ? combo.ranking : ''}
                          onChange={(e) => {
                            const val = e.target.value === '' ? null : parseInt(e.target.value, 10)
                            setComboDrafts((prev) => prev.map((row, i) => (i === idx ? { ...row, ranking: Number.isNaN(val) ? null : val } : row)))
                          }}
                          placeholder="Rank"
                        />
                      </div>

                      <textarea
                        rows={3}
                        className="w-full mt-3 p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.06)] text-sm"
                        value={combo.line || ''}
                        onChange={(e) => setComboDrafts((prev) => prev.map((row, i) => (i === idx ? { ...row, line: e.target.value } : row)))}
                        placeholder="Combo string"
                      />

                      <div className="mt-3 flex items-center justify-between gap-3">
                        <select
                          className="w-full max-w-[320px] p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.06)] text-sm"
                          value={combo.assist || ''}
                          onChange={(e) => setComboDrafts((prev) => prev.map((row, i) => (i === idx ? { ...row, assist: e.target.value || null } : row)))}
                        >
                          <option value="">— none —</option>
                          {champions
                            .filter((ch) => !(activeChampion && activeChampion.id && String(ch.id) === String(activeChampion.id)))
                            .map((ch) => (
                              <option key={ch.id} value={String(ch.id)}>{ch.name}</option>
                            ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => setComboDrafts((prev) => prev.filter((_, i) => i !== idx))}
                          className="px-3 py-1 rounded bg-[rgba(255,0,0,0.14)] text-rose-300 border border-[rgba(255,0,0,0.25)] text-sm"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (

            <div className="space-y-3">
              {(() => {
                const list = getChampionCombosList()
                const selectedAssist = selection && selection.assist ? String(selection.assist) : ''
                const visibleList = getVisibleCombos(list)

                if (visibleList.length === 0) {
                  return (
                    <div className="p-3 text-text-muted flex items-center justify-between">
                      <div>{selectedAssist ? 'No combos available for this main + assist selection.' : 'No combos available for this champion.'}</div>
                      <button className="px-3 py-1 rounded bg-[var(--color-accent-primary)] text-white" onClick={() => {
                        beginInlineEdit()
                        setComboDrafts([{ line: '', fuse: 'Freestyle', sort_order: 0, name: '', ranking: null, assist: null }])
                      }}>Add combo</button>
                    </div>
                  )
                }

                return visibleList.map((c, i) => {
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
            )}
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
        <div className={scrollableCardClass}>
          <h2 className="text-2xl font-semibold mb-2">Abilities</h2>
          {sectionSaveError && <div className="mb-3 text-sm text-rose-400">{sectionSaveError}</div>}
          {isEditingCurrentTab
            ? <RichTextEditor value={sectionDraft} onChange={setSectionDraft} placeholder="Ability notes" minHeight={420} />
            : renderRichSection(activeChampion && activeChampion.metadata ? activeChampion.metadata.abilities : '', 'No ability notes.')}
        </div>
      )}

      {activeTab === 'Strategy' && (
        <div className={scrollableCardClass}>
          <h2 className="text-2xl font-semibold mb-2">Strategy</h2>
          {sectionSaveError && <div className="mb-3 text-sm text-rose-400">{sectionSaveError}</div>}
          {isEditingCurrentTab
            ? <RichTextEditor value={sectionDraft} onChange={setSectionDraft} placeholder="Strategy notes" minHeight={420} />
            : renderRichSection(activeChampion ? activeChampion.strategy : '', 'No strategy notes.')}
        </div>
      )}

      {activeTab === 'Teams' && (
        <div className={scrollableCardClass}>
          <h2 className="text-2xl font-semibold mb-2">Teams</h2>
          {sectionSaveError && <div className="mb-3 text-sm text-rose-400">{sectionSaveError}</div>}
          {isEditingCurrentTab
            ? <RichTextEditor value={sectionDraft} onChange={setSectionDraft} placeholder="Teams / presets" minHeight={420} />
            : renderRichSection(activeChampion && activeChampion.metadata ? activeChampion.metadata.teams : '', 'No team notes.')}
        </div>
      )}

      {activeTab === 'Matchups' && (
        <div className={scrollableCardClass}>
          <h2 className="text-2xl font-semibold mb-2">Matchups</h2>
          {sectionSaveError && <div className="mb-3 text-sm text-rose-400">{sectionSaveError}</div>}
          {isEditingCurrentTab
            ? <RichTextEditor value={sectionDraft} onChange={setSectionDraft} placeholder="Matchups" minHeight={420} />
            : renderRichSection(activeChampion && activeChampion.metadata ? activeChampion.metadata.matchups : '', 'No matchup notes.')}
        </div>
      )}

      {activeTab === 'Notes' && (
        <NotesWorkspace
          activeChampion={activeChampion}
          championCode={selection && selection.main ? selection.main : ''}
          onChampionUpdated={setActiveChampion}
        />
      )}
    </main>
  )
}
