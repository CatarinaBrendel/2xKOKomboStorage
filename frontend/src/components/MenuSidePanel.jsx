import React, { useEffect, useState } from 'react'
import logoUrl from '../assets/logo_nobg.png'
import getTauriModule from '../utils/tauri'
import ComboVisual from './ComboVisual'
import AddChampionModal from './AddChampionModal'

 

export default function MenuSidePanel({ selection: propSelection, onSelectionChange, showAddModal, setShowAddModal, newChampion, setNewChampion, searchQuery = '' }){
  const [championsList, setChampionsList] = useState([])
  const [championImages, setChampionImages] = useState({})
  const [toast, setToast] = useState(null)
  const [localSelection, setLocalSelection] = useState({ main: null, assist: null })
  const selection = propSelection || localSelection
  const setSelection = onSelectionChange || setLocalSelection

  // support either controlled modal/newChampion (from App) or local state
  const [innerShowAddModal, setInnerShowAddModal] = useState(false)
  const [innerNewChampion, setInnerNewChampion] = useState({ name: '', key: '', role: '', notes: '' })
  const showAddModalState = typeof showAddModal !== 'undefined' ? showAddModal : innerShowAddModal
  const setShowAddModalState = setShowAddModal || setInnerShowAddModal
  const newChampionState = typeof newChampion !== 'undefined' ? newChampion : innerNewChampion
  const setNewChampionState = setNewChampion || setInnerNewChampion

  async function handleWizardFinish(finalData) {
    console.log('handleWizardFinish', finalData)
    const errors = []
    try {
      const name = finalData.name || ''
      const code = finalData.key || name
      let slug = (finalData.name || '').toLowerCase().replace(/\s+/g, '-')
      const ctype = finalData.role || null
      const strategy = finalData.strategy || null
      const metadataObj = {
        notes: finalData.notes || '',
        combos: finalData.combos || '',
        abilities: finalData.abilities || '',
        teams: finalData.teams || '',
        matchups: finalData.matchups || ''
      }
      const metadata = JSON.stringify(metadataObj)

      // dynamic import so Vite doesn't fail resolving @tauri-apps/api in non-tauri environments
      let id = null
      let tauri = null
      try {
        tauri = await getTauriModule()
        if (!tauri) {
          errors.push('Tauri API unavailable — cannot save champion in this environment')
        }

        if (tauri) {
          // If editing (have id), call update; otherwise create
          if (finalData.id) {
            // update existing champion and receive updated champion JSON
            try {
              const updated = await tauri.invoke('update_champion', { id: finalData.id, name, code, slug, ctype, strategy, metadata })
              // updated may be an object or a string id depending on backend; normalize
              if (updated && typeof updated === 'object' && updated.id) {
                id = updated.id
                // update local state to reflect saved values (pull metadata fields if present)
                const meta = updated.metadata || {}
                setNewChampionState({
                  id: updated.id,
                  name: updated.name || name,
                  key: updated.code || code,
                  role: updated.type || ctype || '',
                  notes: meta.notes || (finalData.notes || ''),
                  combos: meta.combos || (finalData.combos || ''),
                  abilities: meta.abilities || (finalData.abilities || ''),
                  teams: meta.teams || (finalData.teams || ''),
                  matchups: meta.matchups || (finalData.matchups || ''),
                  strategy: updated.strategy || strategy || ''
                })
                console.log('updated champion', updated)
              } else if (typeof updated === 'string') {
                id = updated
                // try to fetch full champion record
                try {
                  const fresh = await tauri.invoke('get_champion_by_code', { code: code })
                  if (fresh && fresh.name) {
                    const meta = fresh.metadata || {}
                    setNewChampionState({
                      id: fresh.id || id,
                      name: fresh.name || name,
                      key: fresh.code || code,
                      role: fresh.type || ctype || '',
                      notes: meta.notes || (finalData.notes || ''),
                      combos: meta.combos || (finalData.combos || ''),
                      abilities: meta.abilities || (finalData.abilities || ''),
                      teams: meta.teams || (finalData.teams || ''),
                      matchups: meta.matchups || (finalData.matchups || ''),
                      strategy: fresh.strategy || strategy || ''
                    })
                  }
                } catch (e) {
                  console.warn('failed to re-fetch champion after update', e)
                }
              }
            } catch (e) {
              console.error('update_champion failed', e)
              errors.push('update failed')
            }
          } else {
            try {
              // try create, retry with a modified slug if slug uniqueness causes failure
              const tryAdd = async (trySlug) => await tauri.invoke('add_champion', { name, code, slug: trySlug, ctype, strategy, metadata })
              try {
                id = await tryAdd(slug)
              } catch (err) {
                const msg = err && err.message ? err.message : String(err)
                if (msg.includes('UNIQUE constraint failed: champions.slug')) {
                  const suffix = String(Date.now()).slice(-4)
                  const newSlug = `${slug}-${suffix}`
                  try {
                    id = await tryAdd(newSlug)
                    // update slug variable to newSlug for future fetches
                    slug = newSlug
                  } catch (err2) {
                    console.error('add_champion retry failed', err2)
                    throw err2
                  }
                } else {
                  throw err
                }
              }
              console.log('added champion id', id)
              // set id on local state
              setNewChampionState(prev => ({ ...prev, id: id }))
              // fetch fresh champion record so modal reflects saved metadata
              try {
                const fresh = await tauri.invoke('get_champion_by_code', { code: code })
                if (fresh && fresh.name) {
                  const meta = fresh.metadata || {}
                  setNewChampionState({
                    id: fresh.id || id,
                    name: fresh.name || name,
                    key: fresh.code || code,
                    role: fresh.type || ctype || '',
                    notes: meta.notes || '',
                    combos: meta.combos || '',
                    abilities: meta.abilities || '',
                    teams: meta.teams || '',
                    matchups: meta.matchups || '',
                    strategy: fresh.strategy || strategy || ''
                  })
                }
              } catch (e) {
                console.debug('failed to re-fetch champion after create', e)
              }
                if (!id) {
                  console.error('add_champion returned no id')
                  errors.push('create failed: no id returned')
                }
            } catch (e) {
              console.error('add_champion failed', e)
              errors.push('create failed')
            }
          }
        }
      } catch (err) {
        console.debug('Tauri invoke not available, skipping add_champion/update_champion:', err)
        if (!tauri) errors.push('Tauri invoke error')
      }

      if (finalData.imageBytes && finalData.imageFilename) {
        if (!tauri) {
          // already recorded error above; skip image save
        } else {
            try {
              // Tauri invoke expects camelCase keys for arguments
              await tauri.invoke('save_champion_image', { championId: id, imageType: 'icon', bytes: finalData.imageBytes, filenameHint: finalData.imageFilename })
            console.log('saved image for champion', id)
            // attempt to refresh champion record in modal
            try {
              const fresh = await tauri.invoke('get_champion_by_code', { code })
              if (fresh && fresh.name) {
                const meta = fresh.metadata || {}
                setNewChampionState({
                  id: fresh.id || id,
                  name: fresh.name || name,
                  key: fresh.code || code,
                  role: fresh.type || ctype || '',
                  notes: meta.notes || (finalData.notes || ''),
                  combos: meta.combos || (finalData.combos || ''),
                  abilities: meta.abilities || (finalData.abilities || ''),
                  teams: meta.teams || (finalData.teams || ''),
                  matchups: meta.matchups || (finalData.matchups || ''),
                  strategy: fresh.strategy || strategy || ''
                })
              }
            } catch (e) {
              console.debug('failed to re-fetch champion after save', e)
            }
          } catch (e) {
            console.error('save_champion_image failed', e)
            errors.push('image save failed')
          }
        }
      }
      // Persist normalized combos to DB if user provided structured combos
      if (tauri && id && finalData.combos && Array.isArray(finalData.combos)) {
        try {
          const combosPayload = finalData.combos
            .filter(c => c && String(c.line || '').trim() !== '')
            .map((c, idx) => ({
              line: c && c.line ? c.line : '',
              fuse: c && c.fuse ? c.fuse : 'Freestyle',
              sort_order: (typeof c.sort_order === 'number') ? c.sort_order : idx,
              name: c && c.name ? c.name : null,
              ranking: (typeof c.ranking === 'number') ? c.ranking : null,
              assist: c && c.assist ? c.assist : null,
              tags: Array.isArray(c.tags) ? c.tags : (c.tags ? String(c.tags).split(',').map(x=>x.trim()).filter(Boolean) : null)
            }))
          await tauri.invoke('set_combos', { championId: id, combosJson: JSON.stringify(combosPayload) })
          // refresh champion to pick up DB combos
          try {
            const fresh = await tauri.invoke('get_champion_by_code', { code })
            if (fresh && fresh.name) {
              const meta = fresh.metadata || {}
              setNewChampionState({
                id: fresh.id || id,
                name: fresh.name || name,
                key: fresh.code || code,
                role: fresh.type || ctype || '',
                notes: meta.notes || (finalData.notes || ''),
                combos: fresh.combos || meta.combos || (finalData.combos || ''),
                abilities: meta.abilities || (finalData.abilities || ''),
                teams: meta.teams || (finalData.teams || ''),
                matchups: meta.matchups || (finalData.matchups || ''),
                strategy: fresh.strategy || strategy || ''
              })
            }
          } catch (e) {
            console.debug('failed to re-fetch champion after set_combos', e)
          }
        } catch (e) {
          console.error('set_combos failed', e)
          errors.push('combos save failed')
        }
      }
      } catch (e) {
      console.error('wizard finish error', e)
      errors.push('unexpected error')
    }

    // Close modal, show toast and reset form
    setShowAddModalState(false)
    if (errors.length) {
      setToast({ type: 'error', text: errors.join(' · ') })
    } else {
      setToast({ type: 'success', text: 'Champion saved' })
      try {
        window.dispatchEvent(new Event('champions:changed'))
      } catch (e) {
        console.debug('failed to dispatch champions:changed', e)
      }
    }

    setNewChampionState({ name: '', key: '', role: '', notes: '' })
    // clear toast after a short delay
    setTimeout(() => setToast(null), 3500)
  }

  async function handleWizardDelete(championData) {
    const previousChampionsList = championsList
    const previousChampionImages = championImages
    const errors = []

    const championId = championData && championData.id ? String(championData.id) : ''
    const championCode = championData && (championData.key || championData.code) ? String(championData.key || championData.code) : ''

    // immediate visual feedback: close modal and update current sidepanel list
    setShowAddModalState(false)
    setNewChampionState({ name: '', key: '', role: '', notes: '' })

    if (championId) {
      setChampionsList(prev => prev.filter(c => String(c.id) !== championId))
      setChampionImages(prev => {
        const next = { ...prev }
        delete next[championId]
        return next
      })
    }

    setSelection(prev => {
      if (!prev) return prev
      const next = { ...prev }
      if (championCode && next.main === championCode) next.main = null
      if (championCode && next.assist === championCode) next.assist = null
      return next
    })

    try {
      const tauri = await getTauriModule()
      if (!tauri) {
        errors.push('Tauri API unavailable — cannot delete champion in this environment')
      } else {
        if (!championId) {
          if (championCode) {
            await tauri.invoke('delete_champion_by_code', { code: championCode })
          } else {
            errors.push('missing champion id/code')
          }
        } else {
          try {
            await tauri.invoke('delete_champion', { id: championId })
          } catch (primaryErr) {
            if (championCode) {
              await tauri.invoke('delete_champion_by_code', { code: championCode })
            } else {
              throw primaryErr
            }
          }
        }
      }
    } catch (e) {
      console.error('delete_champion failed', e)
      const message = e && e.message ? String(e.message) : String(e)
      errors.push(`delete failed: ${message}`)
    }

    if (errors.length) {
      // rollback optimistic UI update if deletion failed
      setChampionsList(previousChampionsList)
      setChampionImages(previousChampionImages)
      setToast({ type: 'error', text: errors.join(' · ') })
    } else {
      setToast({ type: 'success', text: 'Champion deleted' })
      try {
        window.dispatchEvent(new Event('champions:changed'))
      } catch (e) {
        console.debug('failed to dispatch champions:changed', e)
      }
    }

    setTimeout(() => setToast(null), 3500)
  }

  // Load champions from DB when running inside Tauri
  useEffect(() => {
    let mounted = true
    async function loadChampions() {
      try {
        const tauri = await getTauriModule()
        if (!tauri) return
        const list = await tauri.invoke('list_champions')
        if (!mounted) return
        if (Array.isArray(list)) {
          setChampionsList(list)
          // fetch images for each champion that has an icon
          list.forEach(async (c) => {
            try {
              if (c.icon && c.icon.path) {
                const url = await tauri.invoke('get_image_data', { filename: c.icon.path })
                if (!mounted) return
                setChampionImages(prev => ({ ...prev, [c.id]: url }))
              }
            } catch (e) {
              // ignore missing images
            }
          })
        }
      } catch (e) {
        console.debug('list_champions failed', e)
      }
    }

    loadChampions()
    function handler() { loadChampions() }
    window.addEventListener('champions:changed', handler)
    return () => { mounted = false; window.removeEventListener('champions:changed', handler) }
  }, [])

  // Take champions to show (2 columns x 6 rows)
  // apply search filtering to champions list (match name, code, slug, notes)
  const filteredChampions = (championsList && championsList.length > 0) ? championsList.filter(c => {
    if (!searchQuery || String(searchQuery).trim() === '') return true
    const q = String(searchQuery).toLowerCase()
    const name = (c.name || '').toString().toLowerCase()
    const code = (c.code || '').toString().toLowerCase()
    const slug = (c.slug || '').toString().toLowerCase()
    let notes = ''
    try {
      if (c.metadata) {
        if (typeof c.metadata === 'string') notes = c.metadata.toLowerCase()
        else if (c.metadata.notes) notes = String(c.metadata.notes).toLowerCase()
        else notes = JSON.stringify(c.metadata).toLowerCase()
      }
    } catch (e) { notes = '' }

    return name.includes(q) || code.includes(q) || slug.includes(q) || notes.includes(q)
  }) : []

  const thumbnails = (filteredChampions && filteredChampions.length > 0)
    ? filteredChampions.slice(0, 12).map(c => ({
        id: c.id,
        filename: c.code || c.id,
        name: c.name,
        url: championImages[c.id] || null
      }))
    : []

  function getChampionName(filename) {
    if (!filename) return ''
    const base = filename.replace(/\.[^/.]+$/, '')
    const matches = base.match(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g)
    if (!matches || matches.length === 0) return base
    return matches[matches.length - 1]
  }

  function handleClick(filename) {
    setSelection(prev => {
      const isMain = prev && prev.main === filename
      const isAssist = prev && prev.assist === filename
      if (isMain) return { ...prev, main: null, assist: null }
      if (isAssist) return { ...prev, assist: null }

      if (!prev || !prev.main) return { ...prev, main: filename }
      if (!prev.assist) return { ...prev, assist: filename }
      // both set -> replace assist
      return { ...prev, assist: filename }
    })
  }

  return (
    <aside className="w-64 min-w-[220px] p-4 flex-shrink-0 h-screen flex flex-col" style={{borderRight:'1px solid var(--color-bg-border)'}}>
      <div className="flex-shrink-0">
        <div className="mb-2 flex justify-center">
          <img src={logoUrl} alt="logo" className="w-36 h-auto object-contain" />
        </div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold">Champions</h2>
          <button
            type="button"
            onClick={() => { setNewChampionState({ name: '', key: '', role: '', notes: '' }); setShowAddModalState(true) }}
            className="ml-2 p-1 rounded hover:bg-[rgba(255,255,255,0.02)]"
            aria-label="Add champion"
            title="Add champion"
          >
            {/* Lucide-style plus icon (inline SVG) */}
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-text-muted)]">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 grid-rows-6 gap-1 mb-4 w-max mx-auto justify-items-center">
        {thumbnails.length > 0 ? (
        thumbnails.map((img, i) => {
          const name = img.name || getChampionName(img.filename)
          const isMain = selection.main === img.filename
          const isAssist = selection.assist === img.filename
          const borderStyle = isMain
            ? { border: '2px solid var(--btn-color-light)' }
            : isAssist
            ? { border: '2px solid var(--btn-color-medium)' }
            : { border: '1px solid rgba(255,255,255,0.04)' }

          return (
            <div
              key={img.id || img.filename}
              onClick={() => handleClick(img.filename)}
              className="w-20 h-20 rounded-md overflow-hidden bg-[rgba(255,255,255,0.02)] flex items-center justify-center relative cursor-pointer"
              style={borderStyle}
              title={name}
            >
                {img.url ? (
                  <img
                    src={img.url}
                    alt={name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.onerror = null
                      e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="100%" height="100%" fill="%232C2C2E"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="72" fill="%23F2F2F7">?</text></svg>'
                    }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center p-1 text-sm text-center">
                    {name}
                  </div>
                )}

              {isMain && (
                <div className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-semibold rounded" style={{ backgroundColor: 'var(--btn-color-light)', color: 'var(--color-bg-default)' }}>
                  main
                </div>
              )}

              {isAssist && (
                <div className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] font-semibold rounded" style={{ backgroundColor: 'var(--btn-color-medium)', color: 'var(--color-text-alt)' }}>
                  assist
                </div>
              )}
            </div>
          )
        })
        ) : (
        Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="w-20 h-20 rounded-md overflow-hidden border border-[rgba(255,255,255,0.04)] flex items-center justify-center bg-[rgba(255,255,255,0.02)]">
            <span className="text-sm">{String.fromCharCode(65 + i)}</span>
          </div>
        ))
        )}
        </div>
      </div>
      <AddChampionModal
        show={showAddModalState}
        onClose={() => setShowAddModalState(false)}
        newChampion={newChampionState}
        setNewChampion={setNewChampionState}
        championsList={championsList}
        championImages={championImages}
        onFinish={handleWizardFinish}
        onDelete={handleWizardDelete}
      />
      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'} text-white z-50`}>
          {toast.text}
        </div>
      )}
    </aside>
  )
}
