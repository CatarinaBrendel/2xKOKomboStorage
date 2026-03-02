import React, { createContext, useContext, useMemo, useState } from 'react'

const ConfirmContext = createContext({
  confirm: async () => false,
})

export function AppConfirmProvider({ children }) {
  const [dialog, setDialog] = useState(null)

  const value = useMemo(() => ({
    confirm(options = {}) {
      return new Promise((resolve) => {
        setDialog({
          title: options.title || 'Confirm action',
          message: options.message || 'Are you sure?',
          confirmText: options.confirmText || 'Continue',
          cancelText: options.cancelText || 'Cancel',
          danger: options.danger !== false,
          resolve,
        })
      })
    },
  }), [])

  function closeWith(result) {
    if (dialog && typeof dialog.resolve === 'function') {
      dialog.resolve(result)
    }
    setDialog(null)
  }

  return (
    <ConfirmContext.Provider value={value}>
      {children}

      {dialog && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => closeWith(false)} />
          <div className="relative z-10 w-[460px] max-w-[92vw] rounded border border-[var(--color-bg-border)] bg-[var(--color-bg-panel)] p-5">
            <h3 className="text-lg font-semibold mb-2">{dialog.title}</h3>
            <p className="text-sm text-text-muted mb-4">{dialog.message}</p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => closeWith(false)}
                className="px-3 py-1.5 rounded bg-[rgba(255,255,255,0.03)] text-text-muted"
              >
                {dialog.cancelText}
              </button>
              <button
                type="button"
                onClick={() => closeWith(true)}
                className={`px-3 py-1.5 rounded text-white ${dialog.danger ? 'bg-rose-600' : 'bg-[var(--color-accent-primary)]'}`}
              >
                {dialog.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  )
}

export function useAppConfirm() {
  return useContext(ConfirmContext)
}
