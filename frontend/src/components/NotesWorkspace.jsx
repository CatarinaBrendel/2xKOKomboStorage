import React, { useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'dompurify'
import { Pencil, Trash2 } from 'lucide-react'
import getTauriModule from '../utils/tauri'
import RichTextEditor from './RichTextEditor'

function stripHtml(text) {
  if (!text) return ''
  const parsed = new DOMParser().parseFromString(String(text), 'text/html')
  return (parsed.body.textContent || '').trim()
}

function deriveNoteTitle(note, fallbackIndex) {
  if (note && note.title && String(note.title).trim() !== '') return String(note.title).trim()
  const plain = stripHtml(note && note.content ? note.content : '')
  if (!plain) return `Note ${fallbackIndex + 1}`
  return plain.split('\n')[0].trim().slice(0, 42) || `Note ${fallbackIndex + 1}`
}

function deriveNotePreview(note) {
  const raw = note && note.content ? String(note.content) : ''
  if (!raw.trim()) return 'No content yet...'

  try {
    const doc = new DOMParser().parseFromString(raw, 'text/html')
    const blocks = doc.body.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,blockquote')
    const parts = []

    for (const block of blocks) {
      let text = (block.textContent || '').replace(/\s+/g, ' ').trim()
      if (!text) continue
      if (block.tagName === 'LI') text = `• ${text}`
      parts.push(text)
      if (parts.length >= 4) break
    }

    const joined = (parts.length > 0 ? parts.join(' · ') : stripHtml(raw)).trim()
    if (!joined) return 'No content yet...'
    return joined.length > 96 ? `${joined.slice(0, 93)}...` : joined
  } catch {
    const plain = stripHtml(raw)
    if (!plain) return 'No content yet...'
    return plain.length > 96 ? `${plain.slice(0, 93)}...` : plain
  }
}

function formatRelativeTime(ts) {
  if (!ts) return 'Recently edited'
  const dt = new Date(ts)
  if (Number.isNaN(dt.getTime())) return 'Recently edited'
  const diffMs = Date.now() - dt.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Edited just now'
  if (minutes < 60) return `Last edited ${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `Last edited ${hours}h ago`
  const days = Math.floor(hours / 24)
  return `Last edited ${days}d ago`
}

export default function NotesWorkspace({ activeChampion, championCode, onChampionUpdated = () => {} }) {
  const [availableTags, setAvailableTags] = useState([])
  const [noteDrafts, setNoteDrafts] = useState([])
  const [selectedNoteId, setSelectedNoteId] = useState(null)
  const [openNoteMenuId, setOpenNoteMenuId] = useState(null)
  const [isSavingNotes, setIsSavingNotes] = useState(false)
  const [isEditing, setIsEditing] = useState(false)
  const [tagInput, setTagInput] = useState('')
  const [isTagDropdownOpen, setIsTagDropdownOpen] = useState(false)
  const tagPickerRef = useRef(null)

  useEffect(() => {
    let mounted = true

    async function loadTags() {
      try {
        const tauri = await getTauriModule()
        if (!tauri) return
        const tags = await tauri.invoke('list_tags')
        if (!mounted) return
        if (Array.isArray(tags)) {
          setAvailableTags(tags)
        }
      } catch (e) {
        console.debug('list_tags failed', e)
      }
    }

    loadTags()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (activeChampion && Array.isArray(activeChampion.notes)) {
      const mapped = activeChampion.notes.map((note, idx) => ({
        id: note.id || `existing-${idx}`,
        title: note.title || '',
        content: note.content || '',
        tag_ids: Array.isArray(note.tag_ids)
          ? note.tag_ids.map((id) => String(id))
          : (note.tag_id ? [String(note.tag_id)] : []),
        tags: Array.isArray(note.tags) ? note.tags : [],
        sort_order: typeof note.sort_order === 'number' ? note.sort_order : idx,
        updated_at: note.updated_at || null,
      }))
      setNoteDrafts(mapped)
      setSelectedNoteId(mapped[0] ? mapped[0].id : null)
      setIsEditing(false)
    } else {
      setNoteDrafts([])
      setSelectedNoteId(null)
      setIsEditing(false)
    }
  }, [activeChampion])

  const selectedNote = useMemo(
    () => noteDrafts.find((note) => note.id === selectedNoteId) || null,
    [noteDrafts, selectedNoteId],
  )

  const selectedTagIdsSet = useMemo(() => {
    if (!selectedNote || !Array.isArray(selectedNote.tag_ids)) return new Set()
    return new Set(selectedNote.tag_ids.map((id) => String(id)))
  }, [selectedNote])

  const selectedTags = useMemo(() => {
    if (!selectedNote || !Array.isArray(selectedNote.tag_ids)) return []
    const ids = new Set(selectedNote.tag_ids.map((id) => String(id)))
    const fromList = availableTags.filter((tag) => ids.has(String(tag.id)))
    if (fromList.length > 0) return fromList

    if (Array.isArray(selectedNote.tags) && selectedNote.tags.length > 0) {
      return selectedNote.tags.map((tag) => ({
        id: String(tag.id),
        name: tag.name,
        slug: tag.slug,
      }))
    }

    return []
  }, [availableTags, selectedNote])

  const filteredTagSuggestions = useMemo(() => {
    const query = tagInput.trim().toLowerCase()
    const source = availableTags.filter((tag) => !selectedTagIdsSet.has(String(tag.id)))
    if (!query) return source.slice(0, 12)
    return source
      .filter((tag) => String(tag.name || '').toLowerCase().includes(query))
      .slice(0, 12)
  }, [availableTags, selectedTagIdsSet, tagInput])

  useEffect(() => {
    function handleOutsideClick(event) {
      if (!tagPickerRef.current) return
      if (!tagPickerRef.current.contains(event.target)) {
        setIsTagDropdownOpen(false)
      }
    }

    document.addEventListener('mousedown', handleOutsideClick)
    return () => document.removeEventListener('mousedown', handleOutsideClick)
  }, [])

  function addTagToSelected(tag) {
    if (!selectedNote || !tag) return
    setNoteDrafts((prev) => prev.map((note) => (
      note.id === selectedNote.id
        ? {
            ...note,
            tag_ids: Array.from(new Set([...(Array.isArray(note.tag_ids) ? note.tag_ids.map(String) : []), String(tag.id)])),
            tags: Array.isArray(note.tags)
              ? (note.tags.some((t) => String(t.id) === String(tag.id)) ? note.tags : note.tags.concat(tag))
              : [tag],
          }
        : note
    )))
  }

  function addExistingTag(tag) {
    if (!tag) return
    addTagToSelected(tag)
    setTagInput('')
    setIsTagDropdownOpen(true)
  }

  function removeTagFromSelected(tagId) {
    if (!selectedNote) return
    setNoteDrafts((prev) => prev.map((note) => (
      note.id === selectedNote.id
        ? {
            ...note,
            tag_ids: (Array.isArray(note.tag_ids) ? note.tag_ids : []).filter((id) => String(id) !== String(tagId)),
            tags: (Array.isArray(note.tags) ? note.tags : []).filter((tag) => String(tag.id) !== String(tagId)),
          }
        : note
    )))
  }

  async function addTagFromInput() {
    const value = tagInput.trim()
    if (!value || !selectedNote) return

    try {
      const exactExisting = availableTags.find(
        (tag) => String(tag.name || '').trim().toLowerCase() === value.toLowerCase(),
      )
      if (exactExisting) {
        addExistingTag(exactExisting)
        return
      }

      const tauri = await getTauriModule()
      if (!tauri) return
      const created = await tauri.invoke('create_or_get_tag', { name: value })
      if (created && created.id) {
        setAvailableTags((prev) => {
          const exists = prev.some((tag) => String(tag.id) === String(created.id))
          if (exists) return prev
          return prev.concat(created).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
        })
        addExistingTag(created)
        setTagInput('')
      }
    } catch (e) {
      console.error('addTagFromInput failed', e)
    }
  }

  function handleTagInputKeyDown(e) {
    if (e.key === 'Enter') {
      e.preventDefault()
      const firstSuggestion = filteredTagSuggestions[0]
      if (firstSuggestion && tagInput.trim() !== '') {
        addExistingTag(firstSuggestion)
      } else {
        addTagFromInput()
      }
      return
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setIsTagDropdownOpen(true)
    }

    if (e.key === 'Escape') {
      setIsTagDropdownOpen(false)
    }
  }

  async function reloadActiveChampionNotes() {
    if (!championCode) return
    try {
      const tauri = await getTauriModule()
      if (!tauri) return
      const refreshed = await tauri.invoke('get_champion_by_code', { code: championCode })
      if (refreshed && refreshed.name) {
        onChampionUpdated(refreshed)
      }
    } catch (e) {
      console.error('reloadActiveChampionNotes failed', e)
    }
  }

  async function saveChampionNotes() {
    if (!activeChampion || !activeChampion.id) return

    try {
      setIsSavingNotes(true)
      const tauri = await getTauriModule()
      if (!tauri) return

      const payload = noteDrafts
        .map((note, idx) => ({
          id: note && note.id ? String(note.id) : null,
          title: note && note.title ? String(note.title) : '',
          content: note && note.content ? String(note.content) : '',
          tag_ids: Array.isArray(note && note.tag_ids) ? note.tag_ids.map((id) => String(id)) : [],
          sort_order: idx,
        }))
        .filter((note) => note.content.trim() !== '')

      await tauri.invoke('set_champion_notes', {
        championId: String(activeChampion.id),
        notesJson: JSON.stringify(payload),
      })

      await reloadActiveChampionNotes()
      setIsEditing(false)
    } catch (e) {
      console.error('saveChampionNotes failed', e)
    } finally {
      setIsSavingNotes(false)
    }
  }

  function createNote() {
    const id = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const next = noteDrafts.concat({
      id,
      title: '',
      content: '',
      tag_ids: [],
      tags: [],
      sort_order: noteDrafts.length,
      updated_at: null,
    })
    setNoteDrafts(next)
    setSelectedNoteId(id)
    setOpenNoteMenuId(null)
    setIsEditing(true)
  }

  async function deleteNoteById(id) {
    try {
      const tauri = await getTauriModule()
      if (!tauri) return
      await tauri.invoke('delete_champion_note', { noteId: String(id) })
      setOpenNoteMenuId(null)
      await reloadActiveChampionNotes()
    } catch (e) {
      console.error('deleteNoteById failed', e)
    }
  }

  async function duplicateNoteById(id) {
    try {
      const tauri = await getTauriModule()
      if (!tauri) return
      const duplicated = await tauri.invoke('duplicate_champion_note', { noteId: String(id) })
      const duplicatedId = duplicated && duplicated.id ? String(duplicated.id) : null
      setOpenNoteMenuId(null)
      await reloadActiveChampionNotes()
      if (duplicatedId) {
        setSelectedNoteId(duplicatedId)
      }
    } catch (e) {
      console.error('duplicateNoteById failed', e)
    }
  }

  async function renameNoteById(id) {
    const source = noteDrafts.find((note) => note.id === id)
    if (!source) return
    const current = source.title || deriveNoteTitle(source, 0)
    const renamed = window.prompt('Rename note', current)
    if (renamed === null) return

    try {
      const tauri = await getTauriModule()
      if (!tauri) return
      await tauri.invoke('rename_champion_note', { noteId: String(id), title: renamed.trim() })
      setOpenNoteMenuId(null)
      await reloadActiveChampionNotes()
      setSelectedNoteId(String(id))
    } catch (e) {
      console.error('renameNoteById failed', e)
    }
  }

  function renderNoteContent(note) {
    if (!note) return null
    const raw = String(note.content || '')

    if (raw.trim() === '') {
      return <div className="text-text-muted">No content yet.</div>
    }

    let htmlToRender = null
    if (raw.includes('<')) {
      htmlToRender = DOMPurify.sanitize(raw)
    } else if (raw.includes('&lt;')) {
      const decoded = (typeof window !== 'undefined')
        ? new DOMParser().parseFromString(raw, 'text/html').documentElement.textContent
        : raw
      htmlToRender = DOMPurify.sanitize(decoded)
    }

    if (htmlToRender) {
      return <div className="richtext-editor-content max-w-none" dangerouslySetInnerHTML={{ __html: htmlToRender }} />
    }

    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) {
      return <div className="text-text-muted">No content yet.</div>
    }

    return (
      <div className="richtext-editor-content max-w-none">
        {lines.map((line, idx) => (
          <p key={idx}>{line}</p>
        ))}
      </div>
    )
  }

  return (
    <div className="card max-h-[calc(100vh-120px)] overflow-hidden p-0">
      <div className="flex min-h-[650px]">
        <aside className="w-[260px] border-r border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.01)]">
          <div className="px-4 py-4 flex items-center justify-between">
            <p className="font-semibold">Notes</p>
            <div className="text-text-muted text-xs">{noteDrafts.length} {noteDrafts.length === 1 ? 'note' : 'notes'}</div>
          </div>

          <div className="px-2 pb-24 max-h-[500px] overflow-y-auto">
            {noteDrafts.length === 0 ? (
              <div className="px-3 py-6 text-sm text-text-muted">No notes yet.</div>
            ) : (
              noteDrafts.map((note, idx) => {
                const selected = note.id === selectedNoteId
                const dotColors = ['#22C55E', '#F7C948', '#3A8DFF', '#E05297', '#A454F6']
                const dotColor = dotColors[idx % dotColors.length]
                const title = deriveNoteTitle(note, idx)
                const preview = deriveNotePreview(note)
                const subtitle = formatRelativeTime(note.updated_at)

                return (
                  <div
                    key={note.id || idx}
                    className={`relative mb-1 rounded-md px-3 py-2 border ${selected ? 'border-[var(--color-accent-primary)] bg-[rgba(58,141,255,0.10)]' : 'border-transparent hover:bg-[rgba(255,255,255,0.03)]'}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedNoteId(note.id)
                        setOpenNoteMenuId(null)
                        setIsEditing(false)
                      }}
                      className="w-full text-left"
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: dotColor }} />
                        <span className="font-semibold leading-tight truncate">{title}</span>
                      </div>
                      <div className="text-text-muted text-sm truncate">{preview}</div>
                      <div className="text-text-muted text-sm mt-1">{subtitle}</div>
                    </button>

                    <div className="absolute top-2 right-2">
                      <button
                        type="button"
                        className="px-2 py-1 rounded text-text-muted hover:bg-[rgba(255,255,255,0.08)]"
                        onClick={() => setOpenNoteMenuId((prev) => (prev === note.id ? null : note.id))}
                        title="More actions"
                      >
                        •••
                      </button>

                      {openNoteMenuId === note.id && (
                        <div className="absolute right-0 mt-1 w-44 rounded border border-[rgba(255,255,255,0.14)] bg-[var(--color-bg-panel)] shadow-lg z-20 overflow-hidden">
                          <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-[rgba(255,255,255,0.05)]" onClick={() => renameNoteById(note.id)}>Rename</button>
                          <button type="button" className="w-full px-3 py-2 text-left text-sm hover:bg-[rgba(255,255,255,0.05)]" onClick={() => duplicateNoteById(note.id)}>Duplicate</button>
                          <button type="button" className="w-full px-3 py-2 text-left text-sm text-rose-400 hover:bg-[rgba(255,0,0,0.12)]" onClick={() => deleteNoteById(note.id)}>Delete Note</button>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </aside>

        <section className="flex-1 flex flex-col min-w-0">
          <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.06)] grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-start">
            <div className="min-w-0">
              {isEditing ? (
                <>
                  <input
                    className="w-full bg-transparent text-3xl font-semibold outline-none"
                    value={selectedNote ? (selectedNote.title || '') : ''}
                    onChange={(e) => {
                      const val = e.target.value
                      if (!selectedNote) return
                      setNoteDrafts((prev) => prev.map((note) => (note.id === selectedNote.id ? { ...note, title: val } : note)))
                    }}
                    placeholder="Untitled note"
                    disabled={!selectedNote}
                  />
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-semibold">
                    {selectedNote ? deriveNoteTitle(selectedNote, 0) : 'Untitled note'}
                  </h2>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 justify-self-end">
              <button
                type="button"
                onClick={() => {
                  if (!selectedNote) return
                  deleteNoteById(selectedNote.id)
                }}
                disabled={!selectedNote}
                className="px-2 py-1.5 rounded bg-[rgba(255,0,0,0.14)] text-rose-300 border border-[rgba(255,0,0,0.25)] disabled:opacity-50"
                title="Delete note"
                aria-label="Delete note"
              >
                <Trash2 size={12} />
              </button>

              {isEditing ? (
                <button
                  type="button"
                  onClick={saveChampionNotes}
                  disabled={isSavingNotes || !activeChampion || !activeChampion.id}
                  className="px-3 py-1 rounded bg-[var(--color-accent-primary)] text-white disabled:opacity-60 text-sm"
                >
                  {isSavingNotes ? 'Saving…' : 'Save'}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={createNote}
                    className="px-2.5 py-1 rounded bg-[rgba(255,255,255,0.03)] text-sm"
                  >
                    + Note
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (selectedNote) setIsEditing(true) }}
                    disabled={!selectedNote}
                    className="px-2 py-1.5 rounded bg-[rgba(255,255,255,0.03)] disabled:opacity-50"
                    title="Edit note"
                    aria-label="Edit note"
                  >
                    <Pencil size={12} />
                  </button>
                </>
              )}
            </div>

            <div className="col-span-2">
              {isEditing ? (
                <div className="w-full">
                  <div ref={tagPickerRef} className="relative w-full">
                    <div className="flex items-center rounded bg-[transparent] border border-[rgba(255,255,255,0.08)] min-h-[40px]">
                      <div className="flex-1 flex flex-wrap items-center gap-1 px-2 py-1">
                        {selectedTags.map((tag) => (
                          <div key={tag.id} className="inline-flex items-center gap-1 px-1 py-[1px] rounded-full bg-[rgba(34,197,94,0.18)] text-emerald-200 border border-[rgba(34,197,94,0.25)] text-[8px]">
                            <span>{tag.name}</span>
                            <button
                              type="button"
                              className="text-emerald-100/80 hover:text-emerald-100"
                              onClick={() => removeTagFromSelected(tag.id)}
                              title="Remove tag"
                            >
                              ✕
                            </button>
                          </div>
                        ))}

                        <input
                          className="flex-1 min-w-[140px] px-1 py-1 bg-transparent text-sm outline-none"
                          value={tagInput}
                          onChange={(e) => {
                            setTagInput(e.target.value)
                            setIsTagDropdownOpen(true)
                          }}
                          onFocus={() => setIsTagDropdownOpen(true)}
                          onKeyDown={handleTagInputKeyDown}
                          placeholder={selectedTags.length > 0 ? 'Add more...' : 'Add tag: type or pick'}
                          disabled={!selectedNote}
                        />
                      </div>
                      <button
                        type="button"
                        className="px-2 py-1 text-text-muted hover:bg-[rgba(255,255,255,0.04)]"
                        onClick={() => setIsTagDropdownOpen((open) => !open)}
                        disabled={!selectedNote}
                        title="Toggle tag list"
                      >
                        ▾
                      </button>
                    </div>

                    {isTagDropdownOpen && selectedNote && (
                      <div className="absolute left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded border border-[rgba(255,255,255,0.12)] bg-[var(--color-bg-panel)] shadow-lg z-30">
                        {filteredTagSuggestions.length > 0 ? (
                          filteredTagSuggestions.map((tag) => (
                            <button
                              key={tag.id}
                              type="button"
                              className="w-full px-3 py-2 text-left text-sm hover:bg-[rgba(255,255,255,0.05)]"
                              onClick={() => addExistingTag(tag)}
                            >
                              {tag.name}
                            </button>
                          ))
                        ) : tagInput.trim() ? (
                          <button
                            type="button"
                            className="w-full px-3 py-2 text-left text-sm text-emerald-200 hover:bg-[rgba(34,197,94,0.12)]"
                            onClick={addTagFromInput}
                          >
                            Create "{tagInput.trim()}"
                          </button>
                        ) : (
                          <div className="px-3 py-2 text-sm text-text-muted">No more tags available.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  {selectedTags.map((tag) => (
                    <span key={tag.id} className="px-1.5 py-0.5 rounded-full bg-[rgba(34,197,94,0.18)] text-emerald-200 border border-[rgba(34,197,94,0.25)] text-[10px]">
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="p-5 min-h-0 overflow-y-auto">
            {selectedNote ? (
              isEditing ? (
                <RichTextEditor
                  value={selectedNote.content || ''}
                  onChange={(val) => {
                    setNoteDrafts((prev) => prev.map((note) => (note.id === selectedNote.id ? { ...note, content: val } : note)))
                  }}
                  placeholder="Write note..."
                  minHeight={390}
                  maxHeight={600}
                />
              ) : (
                renderNoteContent(selectedNote)
              )
            ) : (
              <div className="text-text-muted">Select a note on the left or create a new one.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
