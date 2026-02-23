export default async function getTauriModule() {
  // If the Tauri globals are not present, avoid attempting any import (prevents Vite import analysis errors)
  if (typeof window === 'undefined') return null
  const hasTauriGlobal = !!(window.__TAURI__ || window.__TAURI_IPC__ || window.__TAURI__ || window.__TAURI_INTERNALS__)
  if (!hasTauriGlobal) return null

  // Use a guarded dynamic import so Vite doesn't statically analyze the module specifier.
  try {
    // import the package root and return the `core` namespace which contains `invoke`.
    const pkg = await import(/* @vite-ignore */ '@tauri-apps/api')
    if (pkg && pkg.core) return pkg.core
    return pkg
  } catch (e) {
    return null
  }
}
