import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'

const ToastContext = createContext({
  showToast: () => {},
})

export function AppToastProvider({ children }) {
  const [toast, setToast] = useState(null)

  useEffect(() => {
    if (!toast) return undefined
    const timer = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(timer)
  }, [toast])

  const value = useMemo(() => ({
    showToast(input) {
      if (!input) return
      if (typeof input === 'string') {
        setToast({ type: 'success', text: input })
        return
      }
      const nextType = input.type === 'error' ? 'error' : 'success'
      const nextText = input.text ? String(input.text) : ''
      if (!nextText) return
      setToast({ type: nextType, text: nextText })
    },
  }), [])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast && (
        <div className={`fixed bottom-6 left-1/2 transform -translate-x-1/2 px-4 py-2 rounded ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-rose-600'} text-white z-50`}>
          {toast.text}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useAppToast() {
  return useContext(ToastContext)
}
