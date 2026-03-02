import React from 'react'
import ComboVisual from '../ComboVisual'

function FilterPill({ children, active }) {
  return (
    <button className={`px-3 py-1 rounded-full text-sm ${active ? 'bg-[var(--color-accent-primary)] text-white' : 'bg-[rgba(255,255,255,0.03)] text-text-muted'}`}>
      {children}
    </button>
  )
}

export default function CombosTab({
  selection,
  scrollableCardClass,
  activeChampion,
  getChampionName,
  sectionSaveError,
  isEditing,
  comboDrafts,
  setComboDrafts,
  champions,
  getChampionCombosList,
  getVisibleCombos,
  beginInlineEdit,
}) {
  return (
    <div className={scrollableCardClass}>
      <h2 className="text-xl font-semibold mb-2">Combos for {activeChampion ? activeChampion.name : getChampionName(selection.main)}</h2>
      {selection.assist ? (
        <p className="text-xs text-text-muted mb-4">Filtering combos that include assist {getChampionName(selection.assist)}</p>
      ) : (
        <p className="text-xs text-text-muted mb-4">Showing all combos for {activeChampion ? activeChampion.name : getChampionName(selection.main)}</p>
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

      {isEditing ? (
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

              let assistName = null
              if (assistRaw) {
                const found = champions && champions.find(ch => ch.id === String(assistRaw) || ch.code === String(assistRaw) || ch.name === String(assistRaw))
                assistName = found ? found.name : assistRaw
              }

              return (
                <div key={i} className="p-3 bg-[rgba(255,255,255,0.02)] rounded">
                  <div className="flex items-start justify-between mb-2">
                    <div className="text-sm font-semibold">{comboName || `Combo ${i + 1}`}</div>
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
  )
}
