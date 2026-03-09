import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'
import { SettingsProvider } from './contexts/SettingsContext'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </React.StrictMode>
)
