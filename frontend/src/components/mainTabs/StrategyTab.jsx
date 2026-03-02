import React from 'react'
import RichTextEditor from '../RichTextEditor'

export default function StrategyTab({
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
      <h2 className="text-2xl font-semibold mb-2">Strategy</h2>
      {sectionSaveError && <div className="mb-3 text-sm text-rose-400">{sectionSaveError}</div>}
      {isEditing
        ? <RichTextEditor value={sectionDraft} onChange={setSectionDraft} placeholder="Strategy notes" minHeight={420} />
        : renderRichSection(activeChampion ? activeChampion.strategy : '', 'No strategy notes.')}
    </div>
  )
}
