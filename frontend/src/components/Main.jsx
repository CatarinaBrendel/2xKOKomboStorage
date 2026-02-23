import React, { useState } from 'react'

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

  const tabs = ['Overview', 'Combos', 'Abilities', 'Strategy', 'Teams', 'Matchups']
  if (!selection || !selection.main) {
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

      {/* Sub-menu tabs */}
      <div className="mb-4 flex items-center gap-2">
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

      {/* Tab content */}
      {activeTab === 'Overview' && (
        <div className="card p-6">
          <h2 className="text-2xl font-semibold mb-2">Overview</h2>
          <p className="text-text-muted">Summary and quick stats go here.</p>
        </div>
      )}

      {activeTab === 'Combos' && (
        selection && selection.main ? (
          <div className="card p-6">
            <h2 className="text-2xl font-semibold mb-2">Combos for {getChampionName(selection.main)}</h2>
            {selection.assist ? (
              <p className="text-sm text-text-muted mb-4">Filtering combos that include assist {getChampionName(selection.assist)}</p>
            ) : (
              <p className="text-sm text-text-muted mb-4">Showing all combos for {getChampionName(selection.main)}</p>
            )}

            <div className="space-y-3">
              <div className="p-3 bg-[rgba(255,255,255,0.02)] rounded">Combo 1 — demo</div>
              <div className="p-3 bg-[rgba(255,255,255,0.02)] rounded">Combo 2 — demo</div>
              <div className="p-3 bg-[rgba(255,255,255,0.02)] rounded">Combo 3 — demo</div>
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
          <p className="text-text-muted">Strategy notes and tips go here.</p>
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
