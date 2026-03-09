import React, { createContext, useContext, useEffect, useState } from 'react'
import getTauriModule from '../utils/tauri'

const SettingsContext = createContext({
  userTag: '',
  backupsFolder: '',
  setUserTag: () => {},
  setBackupsFolder: () => {},
  reload: () => {},
})

export function SettingsProvider({ children }) {
  const [userTag, setUserTagState] = useState('')
  const [backupsFolder, setBackupsFolderState] = useState('')

  async function load() {
    try {
      const tauri = await getTauriModule()
      if (!tauri) return
      const res = await tauri.invoke('get_settings')
      if (res) {
        const tag = res.user_tag || res.userTag || ''
        const folder = res.backups_folder || res.backupsFolder || ''
        if (tag) setUserTagState(String(tag))
        if (folder) setBackupsFolderState(String(folder))
      }
    } catch (e) {
      // ignore failures to load settings in non-tauri environments
    }
  }

  useEffect(() => {
    load()
    // intentionally run once on mount
  }, [])

  async function setUserTag(value) {
    try {
      const tauri = await getTauriModule()
      if (tauri) await tauri.invoke('set_settings', { user_tag: value || null, userTag: value || null })
    } catch (e) {
      // ignore
    }
    setUserTagState(value || '')
  }

  async function setBackupsFolder(value) {
    try {
      const tauri = await getTauriModule()
      if (tauri) await tauri.invoke('set_settings', { backups_folder: value || null, backupsFolder: value || null })
    } catch (e) {
      // ignore
    }
    setBackupsFolderState(value || '')
  }

  const ctx = {
    userTag,
    backupsFolder,
    setUserTag,
    setBackupsFolder,
    reload: load,
  }

  return (
    <SettingsContext.Provider value={ctx}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}

export default SettingsContext
