import React, { useState, useRef } from 'react'
import getTauriModule from '../utils/tauri'
import { useAppToast } from './AppToastProvider'

export default function BackupDbModal({ show = false, onClose = () => {} }){
  const { showToast } = useAppToast()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [destPath, setDestPath] = useState('')
  const [defaultFolder, setDefaultFolder] = useState('')
  const inputRef = useRef(null)

  function sanitizePath(p) {
    if (!p) return ''
    let s = String(p)
    // remove accidental toast-like prefixes
    s = s.replace(/^\s*Saved to:?\s*/i, '')
    // strip file:// prefix and trailing slashes
    s = s.replace(/^file:\/\//i, '')
    s = s.replace(/\/$/, '')
    try { s = decodeURI(s) } catch (e) {}
    return s
  }

  // Note: keep hooks unconditional; only early-return after hooks are declared

  async function doBackup(){
    setLoading(true)
    setResult(null)
    try {
      const tauri = await getTauriModule()
      if (!tauri) {
        showToast({ type: 'error', text: 'Tauri API unavailable — cannot backup DB here' })
        setLoading(false)
        return
      }
      console.log('backup_db_to invoked with destPath:', destPath)
      const destArg = destPath === '' ? null : destPath
      console.log('backup_db_to destArg:', destArg)
      const dest = await tauri.invoke('backup_db_to', { dest: destArg })
      console.log('backup_db_to response:', dest)
      setResult({ ok: true, path: dest })
      showToast({ type: 'success', text: `Backup saved: ${dest}` })
    } catch (e) {
      const message = e && e.message ? String(e.message) : String(e)
      setResult({ ok: false, error: message })
      showToast({ type: 'error', text: `Backup failed: ${message}` })
    } finally {
      setLoading(false)
    }
  }

  async function chooseFolder(){
    // Try a synchronous global window dialog first (preserves the user gesture).
    try {
      const globalDialog = (typeof window !== 'undefined') && (
        (window.__TAURI__ && window.__TAURI__.dialog) ||
        (window.__TAURI__ && window.__TAURI__.api && window.__TAURI__.api.dialog) ||
        (window.tauri && window.tauri.dialog) ||
        null
      )
      if (globalDialog && typeof globalDialog.open === 'function') {
        const selected = await globalDialog.open({ directory: true })
        console.log('global dialog.open returned:', selected)
        if (!selected) return
        let path = Array.isArray(selected) ? selected[0] : selected
        path = String(path)
        if (path && !path.startsWith('/') && !/^[A-Za-z]:\\/.test(path)) {
          try {
            const api = await import(/* @vite-ignore */ '@tauri-apps/api')
            if (api && api.path && typeof api.path.homeDir === 'function') {
              const home = await api.path.homeDir()
              if (home) path = `${home.replace(/\\/g,'/')}/${path}`
            }
          } catch (err) {
            console.log('could not resolve relative dialog path via api.path.homeDir', err)
          }
        }
        const norm = sanitizePath(path)
        setDestPath(norm)
        console.log('destPath set to (raw):', path, 'normalized:', norm)
        return
      }
    } catch (e) {
      console.log('global dialog attempt failed', e)
    }

    // Fallback: try importing @tauri-apps/api.dialog directly and invoking it.
    try {
      const api = await import(/* @vite-ignore */ '@tauri-apps/api')
      const dialogModule = api.dialog ?? api.default?.dialog ?? api.core?.dialog ?? null
      if (dialogModule && typeof dialogModule.open === 'function') {
        const selected = await dialogModule.open({ directory: true })
        console.log('tauri dialog.open fallback returned:', selected)
        if (selected) {
          let path = Array.isArray(selected) ? selected[0] : selected
          path = String(path)
          if (path && !path.startsWith('/') && !/^[A-Za-z]:\\/.test(path)) {
            try {
              const apiPath = api.path ?? api.default?.path ?? api.core?.path ?? null
              if (apiPath && typeof apiPath.homeDir === 'function') {
                const home = await apiPath.homeDir()
                if (home) path = `${home.replace(/\\/g,'/')}/${path}`
              }
            } catch (err) {
              console.log('could not resolve relative dialog path via api.path.homeDir', err)
            }
          }
          const norm = sanitizePath(path)
          setDestPath(norm)
          console.log('destPath set (fallback) to (raw):', path, 'normalized:', norm)
          return
        }
      }
    } catch (err) {
      console.log('direct import dialog fallback failed', err)
    }

    // Fallback: click the hidden file input synchronously to preserve gesture.
    if (inputRef.current) {
      try {
        inputRef.current.value = null
        inputRef.current.click()
        console.log('fallback: clicked hidden file input synchronously')
        return
      } catch (err) {
        console.log('fallback input click failed', err)
      }
    }

    // Start a background import for diagnostics (non-blocking).
    (async () => {
      try {
        const pkg = await import(/* @vite-ignore */ '@tauri-apps/api')
        console.log('background tauri pkg:', !!pkg)
        let dialogModule = pkg.dialog ?? pkg.default?.dialog ?? pkg.core?.dialog ?? null
        if (!dialogModule) {
          try {
            const subPath = '@tauri-apps/api' + '/dialog'
            const sub = await import(/* @vite-ignore */ (subPath))
            dialogModule = sub?.dialog ?? sub?.default ?? sub
            console.log('background imported dialog submodule:', Object.keys(sub || {}))
          } catch (subErr) {
            console.log('background import dialog submodule error', subErr)
          }
        }
        console.log('background dialogModule available:', Boolean(dialogModule))
      } catch (bgErr) {
        console.log('background import failed', bgErr)
      }
    })()

    showToast({ type: 'error', text: 'Folder picker unavailable in this environment' })
    return
  }

  // Resolve the application's default backups folder when running inside Tauri
  React.useEffect(() => {
    let mounted = true
    if (!show) return
    ;(async () => {
      try {
        const api = await import(/* @vite-ignore */ '@tauri-apps/api')
        const pathApi = api.path ?? api.default?.path ?? api.core?.path ?? null
        if (!pathApi) return
        let base = null
        try { base = await pathApi.documentDir() } catch (e) { /* ignore */ }
        if (!base) {
          try { base = await pathApi.dataDir() } catch (e) { /* ignore */ }
        }
        if (base && mounted) {
          const folder = sanitizePath(`${base.replace(/\\/g,'/')}/2xKOKombo Backups`)
          setDefaultFolder(folder)
        }
      } catch (err) {
        // ignore
      }
    })()
    return () => { mounted = false }
  }, [show])

  async function onInputChange(e) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const first = files[0]
    // Some webviews (Tauri) expose a `path` property on File objects; use it if available.
    if (first.path) {
      // derive parent directory from the first file path
      try {
        const p = String(first.path)
        const idx = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'))
        if (idx > 0) {
          const norm = sanitizePath(p.slice(0, idx))
          setDestPath(norm)
          console.log('onInputChange set destPath to', norm)
        } else {
          const norm = sanitizePath(p)
          setDestPath(norm)
          console.log('onInputChange set destPath to', norm)
        }
      } catch (err) {
        {
          const norm = sanitizePath(String(first.path))
          setDestPath(norm)
          console.log('onInputChange file.path -> destPath:', norm)
        }
      }
      return
    }
    // Fallback: derive folder from webkitRelativePath (browser only, no absolute path)
    if (first.webkitRelativePath) {
      const parts = first.webkitRelativePath.split('/')
      let rel = ''
      if (parts.length > 1) rel = parts.slice(0, -1).join('/')
      else rel = parts[0] || ''
      // If this is a non-absolute relative path (e.g. "Desktop"), try to resolve
      // to the user's home directory via the Tauri `path` API when available.
      if (rel && !rel.startsWith('/') && !/^[A-Za-z]:\\/.test(rel)) {
        try {
          const api = await import(/* @vite-ignore */ '@tauri-apps/api')
          if (api && api.path && typeof api.path.homeDir === 'function') {
            const home = await api.path.homeDir()
            if (home) {
              const resolved = sanitizePath(`${home.replace(/\\/g,'/')}/${rel}`)
              setDestPath(resolved)
              console.log('resolved webkitrelative to', resolved)
              showToast({ type: 'info', text: 'Folder selected (resolved to absolute path)' })
              return
            }
          }
        } catch (err) {
          console.debug('could not resolve relative path to homeDir', err)
        }
      }
      setDestPath(sanitizePath(rel))
      showToast({ type: 'info', text: 'Folder selected in browser fallback (path not absolute)' })
      return
    }
    showToast({ type: 'error', text: 'Could not determine selected folder path' })
  }

  if (!show) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={() => { if (!loading) { setResult(null); onClose() } }} />
      <div className="relative w-[420px] max-w-full bg-[var(--color-bg-default)] border border-[rgba(255,255,255,0.04)] rounded p-4">
        <h3 className="text-lg font-semibold mb-2">Backup Database</h3>
        <p className="text-sm text-text-muted mb-4">Create a timestamped backup of the application database. The folder containing backups will be opened after a successful backup.</p>

        <div className="flex flex-col gap-3 mb-3">
          <input ref={inputRef} type="file" webkitdirectory="" directory="" multiple style={{ display: 'none' }} onChange={onInputChange} />
          <div className="flex items-center gap-2">
            <input value={destPath} readOnly placeholder="No folder selected — backups use default" className="flex-1 p-2 rounded bg-[transparent] border border-[rgba(255,255,255,0.04)] text-sm" />
            <button className="ml-2 px-3 py-1 rounded border" onClick={chooseFolder}>Choose</button>
          </div>
          <div className="text-sm text-text-muted">
            <strong>Will save to:</strong> {(() => {
              const d = new Date()
              const pad = (n) => String(n).padStart(2, '0')
              const ts = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
              const filename = `backup-${ts}.db`
              const base = destPath || defaultFolder || 'Default backups folder'
              return `${base}/${filename}`
            })()}
          </div>
          <div className="flex items-center gap-2">
            <button className="px-3 py-1 rounded bg-[var(--color-accent-primary)] text-white" onClick={doBackup} disabled={loading}>
              {loading ? 'Creating...' : 'Create Backup'}
            </button>
            <button className="px-3 py-1 rounded border" onClick={() => { if (!loading) { setResult(null); onClose() } }}>
              Close
            </button>
          </div>
        </div>

        {result && !result.ok && (
          <div className={`text-sm p-2 rounded bg-[rgba(255,0,0,0.06)] text-white`}>
            {`Error: ${result.error}`}
          </div>
        )}
      </div>
    </div>
  )
}
