import React, { useState, useEffect, useRef } from 'react'
import { Trash2 } from 'lucide-react'
import DOMPurify from 'dompurify'
import getTauriModule from '../utils/tauri'
import { useAppToast } from './AppToastProvider'
import { useAppConfirm } from './AppConfirmProvider'
import OverviewTab from './mainTabs/OverviewTab'
import CombosTab from './mainTabs/CombosTab'
import AbilitiesTab from './mainTabs/AbilitiesTab'
import StrategyTab from './mainTabs/StrategyTab'
import TeamsTab from './mainTabs/TeamsTab'
import MatchupsTab from './mainTabs/MatchupsTab'
import NotesTab from './mainTabs/NotesTab'
import TournamentArea from './mainTabs/TournamentArea'

function getChampionName(filename) {
  if (!filename) return ''
  const base = filename.replace(/\.[^/.]+$/, '')
  const matches = base.match(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g)
  if (!matches || matches.length === 0) return base
  return matches[matches.length - 1]
}

export default function Main({ selection, mainArea = 'champions', onSelectionChange }){
  const { showToast } = useAppToast()
  const { confirm } = useAppConfirm()
  const [activeTab, setActiveTab] = useState('Overview')
  const [champions, setChampions] = useState([])
  const [activeChampion, setActiveChampion] = useState(null)
  const [activeChampionIcon, setActiveChampionIcon] = useState(null)
  const [editingTab, setEditingTab] = useState(null)
  const [sectionDraft, setSectionDraft] = useState('')
  const [overviewDraft, setOverviewDraft] = useState({ name: '', role: '', notes: '' })
  const [comboDrafts, setComboDrafts] = useState([])
  const [isSavingSection, setIsSavingSection] = useState(false)
  const [isDeletingChampion, setIsDeletingChampion] = useState(false)
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

  async function deleteActiveChampion() {
    const championId = activeChampion && activeChampion.id ? String(activeChampion.id) : ''
    const championCode = activeChampion && activeChampion.code
      ? String(activeChampion.code)
      : (selection && selection.main ? String(selection.main) : '')

    if (!championId && !championCode) {
      showToast({ type: 'error', text: 'Missing champion id/code.' })
      return
    }

    const approved = await confirm({
      title: 'Delete Champion',
      message: 'This action cannot be undone, are you sure you want to continue?',
      confirmText: 'Delete',
      cancelText: 'Cancel',
      danger: true,
    })
    if (!approved) return

    setIsDeletingChampion(true)
    try {
      const tauri = await getTauriModule()
      if (!tauri) {
        showToast({ type: 'error', text: 'Could not connect to app backend.' })
        return
      }

      if (championId) {
        try {
          await tauri.invoke('delete_champion', { id: championId })
        } catch (primaryErr) {
          if (championCode) {
            await tauri.invoke('delete_champion_by_code', { code: championCode })
          } else {
            throw primaryErr
          }
        }
      } else {
        await tauri.invoke('delete_champion_by_code', { code: championCode })
      }

      try {
        window.dispatchEvent(new Event('champions:changed'))
      } catch (e) {
        console.debug('failed to dispatch champions:changed', e)
      }

      if (typeof onSelectionChange === 'function') {
        onSelectionChange((prev) => ({
          ...(prev || {}),
          main: null,
          assist: (prev && prev.assist === championCode) ? null : (prev ? prev.assist : null),
        }))
      }

      setActiveChampion(null)
      setActiveChampionIcon(null)
      cancelInlineEdit()
      showToast({ type: 'success', text: 'Champion deleted' })
    } catch (e) {
      console.error('deleteActiveChampion failed', e)
      const message = e && e.message ? String(e.message) : 'Delete failed. Please try again.'
      showToast({ type: 'error', text: message })
    } finally {
      setIsDeletingChampion(false)
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

  if (mainArea === 'tournament') {
    return <TournamentArea />
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
          {activeChampion && (
            <button
              type="button"
              onClick={deleteActiveChampion}
              disabled={isDeletingChampion || isSavingSection}
              className="w-8 h-8 rounded border border-[rgba(226,76,75,0.5)] text-rose-300 hover:bg-[rgba(226,76,75,0.16)] disabled:opacity-60"
              title="Delete Champion"
              aria-label="Delete Champion"
            >
              <Trash2 size={14} className="mx-auto" />
            </button>
          )}
          {isCurrentTabEditable && !isEditingCurrentTab && (
            <button
              type="button"
              onClick={beginInlineEdit}
              disabled={isDeletingChampion}
              title="Edit Champion"
              aria-label="Edit Champion"
              className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.04)] text-sm text-text-muted disabled:opacity-60"
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
        <OverviewTab
          scrollableCardClass={scrollableCardClass}
          sectionSaveError={sectionSaveError}
          activeChampionIcon={activeChampionIcon}
          activeChampion={activeChampion}
          selection={selection}
          getChampionName={getChampionName}
          isEditing={isEditingCurrentTab}
          overviewDraft={overviewDraft}
          setOverviewDraft={setOverviewDraft}
          renderRichSection={renderRichSection}
        />
      )}

      {activeTab === 'Combos' && (
        <CombosTab
          selection={selection}
          scrollableCardClass={scrollableCardClass}
          activeChampion={activeChampion}
          getChampionName={getChampionName}
          sectionSaveError={sectionSaveError}
          isEditing={isEditingCurrentTab}
          comboDrafts={comboDrafts}
          setComboDrafts={setComboDrafts}
          champions={champions}
          getChampionCombosList={getChampionCombosList}
          getVisibleCombos={getVisibleCombos}
          beginInlineEdit={beginInlineEdit}
        />
      )}

      {activeTab === 'Abilities' && (
        <AbilitiesTab
          scrollableCardClass={scrollableCardClass}
          sectionSaveError={sectionSaveError}
          isEditing={isEditingCurrentTab}
          sectionDraft={sectionDraft}
          setSectionDraft={setSectionDraft}
          renderRichSection={renderRichSection}
          activeChampion={activeChampion}
        />
      )}

      {activeTab === 'Strategy' && (
        <StrategyTab
          scrollableCardClass={scrollableCardClass}
          sectionSaveError={sectionSaveError}
          isEditing={isEditingCurrentTab}
          sectionDraft={sectionDraft}
          setSectionDraft={setSectionDraft}
          renderRichSection={renderRichSection}
          activeChampion={activeChampion}
        />
      )}

      {activeTab === 'Teams' && (
        <TeamsTab
          scrollableCardClass={scrollableCardClass}
          sectionSaveError={sectionSaveError}
          isEditing={isEditingCurrentTab}
          sectionDraft={sectionDraft}
          setSectionDraft={setSectionDraft}
          renderRichSection={renderRichSection}
          activeChampion={activeChampion}
        />
      )}

      {activeTab === 'Matchups' && (
        <MatchupsTab
          scrollableCardClass={scrollableCardClass}
          sectionSaveError={sectionSaveError}
          isEditing={isEditingCurrentTab}
          sectionDraft={sectionDraft}
          setSectionDraft={setSectionDraft}
          renderRichSection={renderRichSection}
          activeChampion={activeChampion}
        />
      )}

      {activeTab === 'Notes' && (
        <NotesTab
          activeChampion={activeChampion}
          selection={selection}
          setActiveChampion={setActiveChampion}
        />
      )}
    </main>
  )
}
