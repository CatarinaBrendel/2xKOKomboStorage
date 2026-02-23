import React, { useState } from 'react'
import Topbar from './components/Topbar'
import MenuSidePanel from './components/MenuSidePanel'
import Main from './components/Main'
import getTauriModule from './utils/tauri'

export default function App(){
  const [selection, setSelection] = useState({ main: null, assist: null })
  const [showAddModal, setShowAddModal] = useState(false)
  const [newChampion, setNewChampion] = useState({ name: '', key: '', role: '', notes: '' })

  function getChampionName(filename) {
    if (!filename) return ''
    const base = filename.replace(/\.[^/.]+$/, '')
    const matches = base.match(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g)
    if (!matches || matches.length === 0) return base
    return matches[matches.length - 1]
  }

  // Open the wizard for editing an existing champion (prefill basic fields)
  function openEditChampion(filename){
    const name = getChampionName(filename) || ''
    // open modal immediately, then try to fetch full champion from backend
    console.log('openEditChampion', filename)
    setShowAddModal(true)
    ;(async () => {
      const tauri = await getTauriModule()
      if (!tauri) {
        // running in plain dev server/browser — not an error, silently fall back
        console.debug('get_champion_by_code skipped; tauri not available')
        setNewChampion({ name, key: filename || '', role: '', notes: '' })
        return
      }

      try {
        let res = null
        try {
          res = await tauri.invoke('get_champion_by_code', { code: filename })
        } catch (e) {
          console.debug('get_champion_by_code did not find by filename, will try list_champions', e)
        }

        if (!res) {
          try {
            const list = await tauri.invoke('list_champions')
            if (Array.isArray(list)) {
              const filenameNoExt = (filename || '').replace(/\.[^/.]+$/, '')
              const match = list.find(c => c.code === filename || c.code === filenameNoExt || c.slug === filenameNoExt || c.name === name)
              if (match) res = match
            }
          } catch (e) {
            console.debug('list_champions fallback failed', e)
          }
        }

        if (res && res.name) {
          const meta = res.metadata || {}
          // fetch champions list to resolve assist names -> ids when needed
          let championsList = []
          try {
            const list = await tauri.invoke('list_champions')
            if (Array.isArray(list)) championsList = list
          } catch (e) {
            console.debug('failed to load champions list for assist resolution', e)
          }

          const resolveAssist = (val) => {
            if (!val) return null
            // if already an id present in championsList, return as-is
            const byId = championsList.find(x => x.id === String(val))
            if (byId) return byId.id
            // try match by name
            const byName = championsList.find(x => x.name === String(val))
            if (byName) return byName.id
            // try match by code
            const byCode = championsList.find(x => x.code === String(val))
            if (byCode) return byCode.id
            return null
          }

          // prefer combos from res.combos (DB table) falling back to metadata.combos
          const combosFromDb = res.combos && Array.isArray(res.combos)
            ? res.combos.map(c => ({
                line: c.line || '',
                fuse: c.fuse || 'Freestyle',
                sort_order: c.sort_order || 0,
                name: c.name || null,
                ranking: c.ranking || null,
                assist: resolveAssist(c.assist || null)
              }))
            : null
          setNewChampion({
            id: res.id || null,
            name: res.name || name,
            key: res.code || filename || '',
            role: res.type || '',
            notes: meta.notes || '',
            combos: combosFromDb || meta.combos || '',
            abilities: meta.abilities || '',
            teams: meta.teams || '',
            matchups: meta.matchups || '',
            strategy: res.strategy || ''
          })
        } else {
          setNewChampion({ name, key: filename || '', role: '', notes: '' })
        }
      } catch (e) {
        console.warn('get_champion_by_code failed', e)
        setNewChampion({ name, key: filename || '', role: '', notes: '' })
      }
    })()
  }

  return (
    <div className="min-h-screen flex" style={{background: 'var(--color-bg-default)'}}>
      <MenuSidePanel
        selection={selection}
        onSelectionChange={setSelection}
        showAddModal={showAddModal}
        setShowAddModal={setShowAddModal}
        newChampion={newChampion}
        setNewChampion={setNewChampion}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <Main selection={selection} onEditChampion={openEditChampion} />
      </div>
    </div>
  )
}
