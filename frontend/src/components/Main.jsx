import React from 'react'

function FilterPill({children, active}){
  return (
    <button className={`px-3 py-1 rounded-full text-sm ${active? 'bg-[var(--color-accent-primary)] text-white' : 'bg-[rgba(255,255,255,0.03)] text-text-muted'}`}>
      {children}
    </button>
  )
}

export default function Main(){
  return (
    <main className="flex-1 p-6 overflow-auto">
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
