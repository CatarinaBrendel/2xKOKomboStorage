import React from 'react'
import Topbar from './components/Topbar'
import MenuSidePanel from './components/MenuSidePanel'
import Main from './components/Main'

export default function App(){
  return (
    <div className="min-h-screen flex" style={{background: 'var(--color-bg-default)'}}>
      <MenuSidePanel />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Topbar />
        <Main />
      </div>
    </div>
  )
}
