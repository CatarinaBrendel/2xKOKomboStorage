import React, { useState, useRef } from 'react'
import { Database, Folder } from 'lucide-react'
import getTauriModule from '../utils/tauri'
import { useAppToast } from './AppToastProvider'
import { useAppConfirm } from './AppConfirmProvider'
import { useSettings } from '../contexts/SettingsContext'

export default function BackupDbModal({ show = false, onClose = () => {} }){
  const { showToast } = useAppToast()
  const { confirm } = useAppConfirm()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [destPath, setDestPath] = useState('')
  const [defaultFolder, setDefaultFolder] = useState('')
  const [restorePath, setRestorePath] = useState('')
  const [restoreFile, setRestoreFile] = useState(null)
  const [tagValue, setTagValue] = useState('')
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const { userTag, backupsFolder, setUserTag, setBackupsFolder } = useSettings()

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
        setRestoreFile(null)
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

  // Load persisted settings (user tag and backups folder) from the native DB when modal opens
  React.useEffect(() => {
    let mounted = true
    if (!show) return
    ;(async () => {
      try {
        const tauri = await getTauriModule()
        if (!tauri) return
        const res = await tauri.invoke('get_settings')
        if (!mounted) return
        if (res) {
          try {
            const tag = res.user_tag || res.userTag || ''
            const folder = res.backups_folder || res.backupsFolder || ''
            if (tag) setTagValue(String(tag))
            if (folder) {
              const norm = sanitizePath(String(folder))
              setDestPath(norm)
            }
          } catch (e) {
            // ignore parse errors
          }
        }
      } catch (e) {
        // ignore if tauri not available
      }
    })()
    return () => { mounted = false }
  }, [show])

  // Also initialize from SettingsProvider if available so UI reflects current state immediately
  React.useEffect(() => {
    if (!show) return
    try {
      if (userTag) setTagValue(userTag)
      if (backupsFolder) setDestPath(backupsFolder)
    } catch (e) {
      // ignore
    }
  }, [show, userTag, backupsFolder])

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
      setRestoreFile(null)
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

  async function onRestoreInputChange(e) {
    const files = e.target.files
    if (!files || files.length === 0) return
    const first = files[0]
    if (first.path) {
      try {
        const p = String(first.path)
        const norm = sanitizePath(p)
        setRestorePath(norm)
        console.log('onRestoreInputChange set restorePath to', norm)
      } catch (err) {
        const norm = sanitizePath(String(first.path))
        setRestorePath(norm)
        console.log('onRestoreInputChange file.path -> restorePath:', norm)
      }
      setRestoreFile(null)
      return
    }
    if (first.name) {
      setRestorePath(first.name)
      setRestoreFile(first)
      showToast({ type: 'info', text: 'Backup file selected (path may be unavailable in this environment)' })
      return
    }
  }

  async function chooseRestoreFile() {
    // Try a synchronous global window dialog first (preserves user gesture)
    try {
      const globalDialog = (typeof window !== 'undefined') && (
        (window.__TAURI__ && window.__TAURI__.dialog) ||
        (window.__TAURI__ && window.__TAURI__.api && window.__TAURI__.api.dialog) ||
        (window.tauri && window.tauri.dialog) ||
        null
      )
      if (globalDialog && typeof globalDialog.open === 'function') {
        const selected = await globalDialog.open({ multiple: false, filters: [{ name: 'DB', extensions: ['db'] }] })
        console.log('global dialog.open (restore) returned:', selected)
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
        setRestorePath(norm)
        setRestoreFile(null)
        console.log('restorePath set to (raw):', path, 'normalized:', norm)
        return
      }
    } catch (e) {
      console.log('global dialog attempt for restore failed', e)
    }

    // Fallback: try importing @tauri-apps/api.dialog directly
    try {
      const api = await import(/* @vite-ignore */ '@tauri-apps/api')
      const dialogModule = api.dialog ?? api.default?.dialog ?? api.core?.dialog ?? null
      if (dialogModule && typeof dialogModule.open === 'function') {
        const selected = await dialogModule.open({ multiple: false, filters: [{ name: 'DB', extensions: ['db'] }] })
        console.log('tauri dialog.open fallback (restore) returned:', selected)
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
          setRestorePath(norm)
          setRestoreFile(null)
          console.log('restorePath set (fallback) to (raw):', path, 'normalized:', norm)
          return
        }
      }
    } catch (err) {
      console.log('direct import dialog fallback for restore failed', err)
    }

    // Final fallback: click hidden file input
    if (fileInputRef.current) {
      try {
        fileInputRef.current.value = null
        fileInputRef.current.click()
        return
      } catch (err) {
        console.log('chooseRestoreFile fallback failed', err)
      }
    }
    showToast({ type: 'error', text: 'File picker unavailable in this environment' })
  }

  async function doRestore() {
    if (!restorePath && !restoreFile) {
      showToast({ type: 'error', text: 'No backup file chosen' })
      return
    }
    // confirm with the user before overwriting the app database
    try {
      const ok = await confirm({
        title: 'Restore database?',
        message: 'This will overwrite the current application database. Are you sure you want to continue?',
        confirmText: 'Restore',
        cancelText: 'Cancel',
        danger: true,
      })
      if (!ok) return
    } catch (e) {
      return
    }
    setLoading(true)
    try {
      const tauri = await getTauriModule()
      if (!tauri) {
        showToast({ type: 'error', text: 'Tauri API unavailable — cannot restore DB here' })
        setLoading(false)
        return
      }
      // If we have a file object (browser may not expose absolute path), send bytes to backend
      let res
      if (restoreFile && !restorePath.startsWith('/') && !/^[A-Za-z]:\\/.test(restorePath)) {
        const buf = await restoreFile.arrayBuffer()
        const arr = Array.from(new Uint8Array(buf))
        
        res = await tauri.invoke('restore_db_from_bytes', { bytes: arr, filenameHint: restoreFile.name })
      } else {
        const srcArg = restorePath || (restoreFile ? restoreFile.name : '')
        
        res = await tauri.invoke('restore_db_from', { src: srcArg })
      }
      setResult({ ok: true, path: res })
      showToast({ type: 'success', text: 'Database restored — restart app for changes to take effect' })
    } catch (e) {
      const message = e && e.message ? String(e.message) : String(e)
      setResult({ ok: false, error: message })
      showToast({ type: 'error', text: `Restore failed: ${message}` })
    } finally {
      setLoading(false)
    }
  }

  if (!show) return null

  const formattedPreview = (() => {
    const d = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const ts = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
    const filename = `backup-${ts}.db`
    const base = destPath || defaultFolder || 'Default backups folder'
    return `${base}/${filename}`
  })()

  async function saveTag() {
    try {
      const tauri = await getTauriModule()
        if (tauri) {
        const args = { user_tag: tagValue || null, backups_folder: destPath || null, userTag: tagValue || null, backupsFolder: destPath || null }
        
        const resp = await tauri.invoke('set_settings', args)

        try {
          const verify = await tauri.invoke('get_settings')
        } catch (gv) {
          console.debug('get_settings verify failed', gv)
        }
      }
    } catch (e) {
      console.debug('failed to persist settings', e)
    }
    try {
      if (typeof setUserTag === 'function') setUserTag(tagValue || '')
      if (typeof setBackupsFolder === 'function') setBackupsFolder(destPath || '')
    } catch (e) {
      // ignore
    }
    showToast({ type: 'success', text: `Tag saved: ${tagValue || '(empty)'}` })
    // Close the modal after saving the tag so the user returns to the main UI
    try {
      if (typeof onClose === 'function') onClose()
    } catch (e) {
      // ignore errors from onClose
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60" onClick={() => { if (!loading) { setResult(null); onClose() } }} />
      <div className="relative w-[760px] max-w-full bg-[var(--color-bg-default)] border border-[rgba(148,163,184,0.02)] rounded p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-semibold text-white/80">Settings</h2>
            <p className="text-xs text-text-muted">Create or upload a backup of the application database. Set your username for online matches.</p>
          </div>
          <button type="button" className="w-8 h-8 rounded border border-[rgba(255,255,255,0.12)] text-text-muted hover:bg-[rgba(255,255,255,0.04)]" aria-label="Close" onClick={() => { if (!loading) { setResult(null); onClose() } }}>✕</button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {/* Create Backup Section */}
          <div className="p-4 border rounded bg-[rgba(148,163,184,0.01)] border-[rgba(148,163,184,0.1)]">
            <div className="flex items-center gap-4 mb-3">
                <div className="w-10 h-10 flex items-center justify-center rounded bg-[rgba(255,255,255,0.01)]">
                  <Database size={20} className="text-white/40" />
                </div>
              <div className="flex-1">
                <div className="font-semibold text-white/60">Create Database Backup</div>
                <div className="text-xs text-text-muted">Create a timestamped backup of the application database.</div>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-2">
              <input ref={inputRef} type="file" webkitdirectory="" directory="" multiple style={{ display: 'none' }} onChange={onInputChange} />
              <input value={destPath} readOnly placeholder="No folder selected — backups use default" className="flex-1 p-2 rounded bg-[transparent] border border-[rgba(148,163,184,0.05)] text-sm text-white/60" />
              <button className="px-3 py-1 rounded border border-[rgba(148,163,184,0.3)] text-white/60" onClick={chooseFolder}>Choose Folder</button>
            </div>

            <div className="text-xs text-text-muted mb-3">Will save to: <span className="text-xs text-text-muted ml-2">{formattedPreview}</span></div>

            <div className="flex items-center gap-3 justify-end">
              <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={doBackup} disabled={loading}>{loading ? 'Creating...' : 'Create Backup'}</button>
            </div>
          </div>

          {/* Upload Backup Section */}
          <div className="p-4 border rounded bg-[rgba(148,163,184,0.01)] border-[rgba(148,163,184,0.1)]">
            <div className="flex items-center gap-4 mb-3">
              <div className="w-10 h-10 flex items-center justify-center rounded bg-[rgba(255,255,255,0.01)]">
                <Folder size={20} className="text-white/40" />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-white/60">Restore DB from Backup File</div>
                <div className="text-xs text-text-muted">Upload a backup file to restore the application database.</div>
              </div>
            </div>

              <div className="flex items-center gap-3 mb-3">
              <input ref={fileInputRef} type="file" style={{ display: 'none' }} accept=".db" onChange={onRestoreInputChange} />
              <input value={restorePath} readOnly placeholder="No backup file selected" className="flex-1 p-2 rounded bg-[transparent] border border-[rgba(148,163,184,0.1)] text-sm text-white/60" />
              <button className="px-3 py-1 rounded border border-[rgba(148,163,184,0.3)] text-white/60" onClick={chooseRestoreFile}>Choose File</button>
            </div>

            <div className="mb-3">
              <div className="flex items-center gap-2 p-1 rounded bg-yellow-700/20 border border-yellow-700/30">
                <div className="text-yellow-300">⚠️</div>
                <div className="text-xs text-text-muted">Restoring a backup will replace the current application data.</div>
              </div>
            </div>

            <div className="flex items-center gap-3 justify-end">
              <button className="px-4 py-2 rounded bg-red-600 text-white" onClick={doRestore} disabled={loading || !restorePath}>{loading ? 'Restoring...' : 'Upload Backup'}</button>
            </div>
          </div>

          {/* Set User Tag Section */}
          <div className="p-4 border rounded bg-[rgba(148,163,184,0.01)] border-[rgba(148,163,184,0.1)]">
            <div>
              <div className="font-semibold text-white/60">Set User Tag for Online Matches</div>
              <div className="text-xs text-text-muted">Set the player tag</div>
            </div>
            <div className="mt-3 flex items-center gap-2 w-full">
              <input value={tagValue} onChange={(e) => setTagValue(e.target.value)} placeholder="Your tag" className="p-2 rounded bg-[transparent] border border-[rgba(148,163,184,0.02)] text-sm text-white/60 w-[320px]" />
              <div className="flex items-center gap-2 ml-auto">
                <button className="px-4 py-2 rounded bg-blue-600 text-white" onClick={saveTag}>Save Tag</button>
                <button className="px-3 py-2 rounded border border-[rgba(148,163,184,0.3)] text-white/60" onClick={() => { if (!loading) { setResult(null); onClose() } }}>Close</button>
              </div>
            </div>
          </div>
        </div>

        {result && !result.ok && (
          <div className={`text-sm p-2 rounded bg-[rgba(255,0,0,0.06)] text-white mt-4`}>
            {`Error: ${result.error}`}
          </div>
        )}
      </div>
    </div>
  )
}
