import React, { useState } from 'react'
import Topbar from './components/Topbar'
import MenuSidePanel from './components/MenuSidePanel'
import Main from './components/Main'
import { AppToastProvider } from './components/AppToastProvider'
import { AppConfirmProvider } from './components/AppConfirmProvider'

export default function App(){
  const [selection, setSelection] = useState({ main: null, assist: null })
  const [mainArea, setMainArea] = useState('champions')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newChampion, setNewChampion] = useState({ name: '', key: '', role: '', notes: '' })
  const [searchQuery, setSearchQuery] = useState('')

  React.useEffect(() => {
    try { console.debug('App.newChampion changed', newChampion) } catch (e) {}
  }, [newChampion])


  return (
    <AppConfirmProvider>
      <AppToastProvider>
        <div className="min-h-screen flex" style={{background: 'var(--color-bg-default)'}}>
          <MenuSidePanel
            selection={selection}
            onSelectionChange={setSelection}
            mainArea={mainArea}
            onMainAreaChange={setMainArea}
            showAddModal={showAddModal}
            setShowAddModal={setShowAddModal}
            newChampion={newChampion}
            setNewChampion={setNewChampion}
            searchQuery={searchQuery}
          />
          <div className="flex-1 flex flex-col overflow-hidden">
            <Topbar value={searchQuery} onChange={setSearchQuery} />
            <Main selection={selection} onSelectionChange={setSelection} mainArea={mainArea} />
          </div>
        </div>
      </AppToastProvider>
    </AppConfirmProvider>
  )
}
