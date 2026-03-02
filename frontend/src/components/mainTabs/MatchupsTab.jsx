import React from 'react'
import RichTextEditor from '../RichTextEditor'

export default function MatchupsTab({
  scrollableCardClass,
  sectionSaveError,
  isEditing,
  sectionDraft,
  setSectionDraft,
  renderRichSection,
  activeChampion,
}) {
  return (
    <div className={scrollableCardClass}>
      <h2 className="text-2xl font-semibold mb-2">Matchups</h2>
      {sectionSaveError && <div className="mb-3 text-sm text-rose-400">{sectionSaveError}</div>}
      {isEditing
        ? <RichTextEditor value={sectionDraft} onChange={setSectionDraft} placeholder="Matchups" minHeight={420} />
        : renderRichSection(activeChampion && activeChampion.metadata ? activeChampion.metadata.matchups : '', 'No matchup notes.')}
    </div>
  )
}
