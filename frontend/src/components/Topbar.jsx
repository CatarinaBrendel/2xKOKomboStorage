import React from 'react'
import {Search} from 'lucide-react'

export default function Topbar({ value = '', onChange = () => {} }) {
  return (
    <header className="px-6 h-16 flex items-center gap-4 shadow-sm" style={{background: 'transparent'}}>
      <div className="flex-1 flex items-center">
        <div className="relative flex items-center w-full">
          <Search className="absolute left-3 text-[var(--color-text-muted)]" size={18} />
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full bg-[rgba(255,255,255,0.03)] placeholder:text-text-muted py-3 pl-10 pr-4 rounded-md border border-[rgba(255,255,255,0.03)] text-sm transition-colors duration-150 focus:outline-none focus:ring-0 focus:border-[var(--color-bg-border)] focus:bg-[rgba(255,255,255,0.035)]"
            placeholder="Search name, notes, tags..."
          />
        </div>
      </div>
    </header>
  )
}
