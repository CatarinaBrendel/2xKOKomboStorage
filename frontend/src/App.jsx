import React, { useState } from 'react'
import Topbar from './components/Topbar'
import MenuSidePanel from './components/MenuSidePanel'
import Main from './components/Main'

export default function App(){
  const [selection, setSelection] = useState({ main: null, assist: null })

  return (
    <div className="min-h-screen flex" style={{background: 'var(--color-bg-default)'}}>
      <MenuSidePanel selection={selection} onSelectionChange={setSelection} />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <Main selection={selection} />
      </div>
    </div>
  )
}
