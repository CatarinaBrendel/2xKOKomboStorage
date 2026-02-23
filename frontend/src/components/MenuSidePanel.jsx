import React, { useEffect, useState } from 'react'
import logoUrl from '../assets/logo_nobg.png'

export default function MenuSidePanel({ selection: propSelection, onSelectionChange }){
  const [images, setImages] = useState([])
  const [localSelection, setLocalSelection] = useState({ main: null, assist: null })
  const selection = propSelection || localSelection
  const setSelection = onSelectionChange || setLocalSelection

  useEffect(() => {
    let mounted = true
    async function loadAssets(){
      try {
        // Use dynamic glob and import each module so Vite resolves them in dev
        // eslint-disable-next-line no-undef
        const modules = import.meta.glob('../assets/champions/*.{png,svg,jpg,jpeg}')
        const entries = Object.entries(modules)
        const loaded = await Promise.all(entries.map(async ([path, resolver]) => {
          const mod = await resolver()
          const url = mod.default || mod
          const parts = path.split('/')
          const filename = parts[parts.length - 1]
          const ext = filename.split('.').pop().toLowerCase()
          return { path, url, filename, ext }
        }))

        // Prefer png images and sort by filename
        loaded.sort((a, b) => {
          if (a.ext === b.ext) return a.filename.localeCompare(b.filename)
          if (a.ext === 'png') return -1
          if (b.ext === 'png') return 1
          return a.filename.localeCompare(b.filename)
        })

        if (mounted) setImages(loaded)
      } catch (e) {
        if (mounted) setImages([])
      }
    }

    loadAssets()
    return () => { mounted = false }
  }, [])

  // Take images to show (2 columns x 6 rows)
  const thumbnails = images.slice(0, 12)

  function getChampionName(filename) {
    if (!filename) return ''
    const base = filename.replace(/\.[^/.]+$/, '')
    const matches = base.match(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g)
    if (!matches || matches.length === 0) return base
    return matches[matches.length - 1]
  }

  function handleClick(filename) {
    setSelection(prev => {
      const isMain = prev && prev.main === filename
      const isAssist = prev && prev.assist === filename
      if (isMain) return { ...prev, main: null }
      if (isAssist) return { ...prev, assist: null }

      if (!prev || !prev.main) return { ...prev, main: filename }
      if (!prev.assist) return { ...prev, assist: filename }
      // both set -> replace assist
      return { ...prev, assist: filename }
    })
  }

  return (
    <aside className="w-64 min-w-[220px] p-4 flex-shrink-0 h-screen flex flex-col" style={{borderRight:'1px solid var(--color-bg-border)'}}>
      <div className="flex-shrink-0">
        <div className="mb-2 flex justify-center">
          <img src={logoUrl} alt="logo" className="w-36 h-auto object-contain" />
        </div>
        <div className="mb-4">
          <h2 className="text-xl font-bold">Champions</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="grid grid-cols-2 grid-rows-6 gap-1 mb-4 w-max mx-auto justify-items-center">
        {thumbnails.length > 0 ? (
        thumbnails.map((img, i) => {
          const name = getChampionName(img.filename)
          const isMain = selection.main === img.filename
          const isAssist = selection.assist === img.filename
          const borderStyle = isMain
            ? { border: '2px solid var(--btn-color-light)' }
            : isAssist
            ? { border: '2px solid var(--btn-color-medium)' }
            : { border: '1px solid rgba(255,255,255,0.04)' }

          return (
            <div
              key={img.path}
              onClick={() => handleClick(img.filename)}
              className="w-20 h-20 rounded-md overflow-hidden bg-[rgba(255,255,255,0.02)] flex items-center justify-center relative cursor-pointer"
              style={borderStyle}
              title={name}
            >
              <img
                src={img.url}
                alt={name}
                className="w-full h-full object-cover"
                onError={(e) => {
                  e.currentTarget.onerror = null
                  e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="100%" height="100%" fill="%232C2C2E"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="Arial" font-size="72" fill="%23F2F2F7">?</text></svg>'
                }}
              />

              {isMain && (
                <div className="absolute top-1 left-1 px-1.5 py-0.5 text-[10px] font-semibold rounded" style={{ backgroundColor: 'var(--btn-color-light)', color: 'var(--color-bg-default)' }}>
                  main
                </div>
              )}

              {isAssist && (
                <div className="absolute top-1 right-1 px-1.5 py-0.5 text-[10px] font-semibold rounded" style={{ backgroundColor: 'var(--btn-color-medium)', color: 'var(--color-text-alt)' }}>
                  assist
                </div>
              )}
            </div>
          )
        })
        ) : (
        Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="w-20 h-20 rounded-md overflow-hidden border border-[rgba(255,255,255,0.04)] flex items-center justify-center bg-[rgba(255,255,255,0.02)]">
            <span className="text-sm">{String.fromCharCode(65 + i)}</span>
          </div>
        ))
        )}
        </div>

        <div className="space-y-3 p-2">
          <div className="flex items-center gap-2 cursor-pointer text-text-default">
          <div className="w-2 h-2 rounded-full bg-[var(--color-accent-primary)]"></div>
          <span>All Combos</span>
        </div>

        <div className="flex items-center gap-2 cursor-pointer text-text-muted">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M12 21l-8-4V6l8-4 8 4v11l-8 4z" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          <span>Favorites</span>
        </div>

        <div>
            <h3 className="text-sm text-text-muted mb-2">Tags</h3>
            <div className="flex flex-col gap-2">
                <button className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)] text-sm">BnB</button>
                <button className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)] text-sm">Corner</button>
                <button className="px-3 py-1 rounded bg-[rgba(255,255,255,0.03)] text-sm text-text-muted">+ Add Tag</button>
            </div>
        </div>
        </div>
      </div>
    </aside>
  )
}
