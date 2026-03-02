import React from 'react'
import NotesWorkspace from '../NotesWorkspace'

export default function NotesTab({ activeChampion, selection, setActiveChampion }) {
  return (
    <NotesWorkspace
      activeChampion={activeChampion}
      championCode={selection && selection.main ? selection.main : ''}
      onChampionUpdated={setActiveChampion}
    />
  )
}
