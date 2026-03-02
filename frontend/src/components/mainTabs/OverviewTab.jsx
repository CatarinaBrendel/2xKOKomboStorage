import React from 'react'
import RichTextEditor from '../RichTextEditor'

export default function OverviewTab({
  scrollableCardClass,
  sectionSaveError,
  activeChampionIcon,
  activeChampion,
  selection,
  getChampionName,
  isEditing,
  overviewDraft,
  setOverviewDraft,
  renderRichSection,
}) {
  return (
    <div className={scrollableCardClass}>
      {sectionSaveError && <div className="mb-3 text-sm text-rose-400">{sectionSaveError}</div>}
      <div className="flex items-start gap-6">
        <div>
          <div className="w-28 h-28 rounded-md bg-[rgba(255,255,255,0.02)] overflow-hidden flex items-center justify-center">
            {activeChampionIcon ? (
              <img src={activeChampionIcon} alt={activeChampion && activeChampion.name} className="w-full h-full object-cover" />
            ) : (
              <div className="text-xl text-text-muted">⭘</div>
            )}
          </div>
        </div>
        <div className="flex-1">
          {isEditing ? (
            <>
              <input
                className="w-full bg-transparent text-2xl font-semibold outline-none border border-[rgba(255,255,255,0.08)] rounded px-3 py-2 mb-2"
                value={overviewDraft.name}
                onChange={(e) => setOverviewDraft((prev) => ({ ...prev, name: e.target.value }))}
                placeholder="Champion name"
              />
              <div className="text-sm text-text-muted mb-3">{activeChampion ? (activeChampion.code || '') : selection.main}</div>
              <div className="mb-3 max-w-sm">
                <label className="block text-xs text-text-muted mb-1">Role</label>
                <input
                  className="w-full bg-transparent text-sm outline-none border border-[rgba(255,255,255,0.08)] rounded px-3 py-2"
                  value={overviewDraft.role}
                  onChange={(e) => setOverviewDraft((prev) => ({ ...prev, role: e.target.value }))}
                  placeholder="Role"
                />
              </div>
            </>
          ) : (
            <>
              <h2 className="text-2xl font-semibold mb-1">{activeChampion ? activeChampion.name : getChampionName(selection.main)}</h2>
              <div className="text-sm text-text-muted mb-3">{activeChampion ? (activeChampion.code || '') : selection.main}</div>
              <div className="mb-3">
                <strong className="text-sm">Role:</strong> <span className="text-sm text-text-muted">{activeChampion && activeChampion.type ? activeChampion.type : '—'}</span>
              </div>
            </>
          )}

          <div className="mt-4">
            <div className="border-t border-[rgba(255,255,255,0.04)] pt-4">
              <div className="text-sm text-text-muted font-semibold mb-4">NOTES</div>
              {isEditing ? (
                <RichTextEditor
                  value={overviewDraft.notes}
                  onChange={(val) => setOverviewDraft((prev) => ({ ...prev, notes: val }))}
                  placeholder="Notes"
                  minHeight={280}
                />
              ) : activeChampion && activeChampion.metadata && activeChampion.metadata.notes ? (
                renderRichSection(activeChampion.metadata.notes, 'No notes.')
              ) : (
                <div className="text-sm text-text-muted">No notes.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
