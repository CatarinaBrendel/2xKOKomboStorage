import React from 'react'
import { ChevronRight, ArrowLeft, ArrowDown, ArrowUp, ArrowDownLeft, ArrowDownRight, ArrowUpLeft, ArrowUpRight } from 'lucide-react'

// Visual renderer for a combo string (eg. "M > H > H > S2 + L > T")
export default function ComboVisual({ line }){
  if (!line) return null

  const tokenColor = (tok) => {
    const t = String(tok).toUpperCase()
    if (t === 'S1') return 'bg-blue-500'
    if (t === 'S2') return 'bg-rose-500'
    if (t.startsWith('S')) return 'bg-rose-500'
    if (t === 'H') return 'bg-purple-700'
    if (t === 'T') return 'bg-lime-300 text-gray-900'
    if (t === 'L') return 'bg-purple-300 text-black'
    return 'bg-violet-500'
  }

  const parsePart = (part) => {
    let s = part.trim()
    let dir = null
    // numeric direction prefix (numpad style)
    // 7 8 9
    // 4 5 6
    // 1 2 3
    // Map: 1=down-left, 2=down, 3=down-right, 4=left, 6=right, 7=up-left, 8=up, 9=up-right
    const mDir = s.match(/^(\d)\s*(.*)$/)
    if (mDir) {
      const n = mDir[1]
      s = mDir[2].trim()
      if (n === '1') dir = 'down-left'
      else if (n === '2') dir = 'down'
      else if (n === '3') dir = 'down-right'
      else if (n === '4') dir = 'left'
      else if (n === '6') dir = 'right'
      else if (n === '7') dir = 'up-left'
      else if (n === '8') dir = 'up'
      else if (n === '9') dir = 'up-right'
      else dir = null
    }

    // handle jump prefix: j.M -> treat as symbol M and label AIR
    let label = null
    const mJump = s.match(/^j\.(.+)$/i)
    if (mJump) {
      s = mJump[1].trim()
      label = 'AIR'
    }

    // handle colon label: T:WARWICK
    const colonParts = s.split(':')
    if (colonParts.length > 1) {
      s = colonParts[0].trim()
      label = colonParts.slice(1).join(':').trim().toUpperCase()
    }

    // handle parenthesis label after symbol: S2(mash)
    const mParen = s.match(/^([^\(]+?)\s*\(([^)]+)\)$/)
    if (mParen) {
      s = mParen[1].trim()
      label = (mParen[2] || '').trim().toUpperCase()
    }

    return { symbol: s, label, dir }
  }

  const segments = String(line).split('>').map(s => s.trim()).filter(Boolean)

  return (
    <div className="mb-3 pt-3">
      <div className="flex items-center gap-2 flex-wrap">
        {segments.map((seg, i) => {
          if (seg.includes('+')) {
            const parts = seg.split('+').map(p => parsePart(p))
            return (
              <div key={i} className="flex items-center gap-2">
                {parts.map((p, j) => (
                  <React.Fragment key={j}>
                    <div className={`relative flex flex-col items-center ${p.dir ? 'ml-4' : ''}`}>
                      {p.label && (
                        <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-[10px] text-text-muted">({p.label})</div>
                      )}
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold border-2 border-black ${tokenColor(p.symbol)}`}>
                        {p.symbol}
                      </div>
                      <div className="absolute -left-5 top-1/2 transform -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                        {p.dir === 'left' && <ArrowLeft size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                        {p.dir === 'down' && <ArrowDown size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                        {p.dir === 'up' && <ArrowUp size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                        {p.dir === 'down-left' && <ArrowDownLeft size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                        {p.dir === 'down-right' && <ArrowDownRight size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                        {p.dir === 'up-left' && <ArrowUpLeft size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                        {p.dir === 'up-right' && <ArrowUpRight size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                      </div>
                    </div>
                    {j < parts.length - 1 && (
                      <div className="text-2xl font-bold text-text-muted">+</div>
                    )}
                  </React.Fragment>
                ))}
                {/* connector after the combined group */}
                {i < segments.length - 1 && (
                  <ChevronRight size={20} strokeWidth={3.5} color="rgba(255,255,255,0.85)" />
                )}
              </div>
            )
          }

          const p = parsePart(seg)
          return (
            <div key={i} className="flex items-center gap-2">
              <div className={`relative flex flex-col items-center ${p.dir ? 'ml-4' : ''}`}>
                {p.label && <div className="absolute -top-4 left-1/2 transform -translate-x-1/2 text-[10px] text-text-muted">({p.label})</div>}
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold border-2 border-black ${tokenColor(p.symbol)}`}>
                  {p.symbol}
                </div>
                <div className="absolute -left-5 top-1/2 transform -translate-y-1/2 w-5 h-5 flex items-center justify-center">
                  {p.dir === 'left' && <ArrowLeft size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                  {p.dir === 'down' && <ArrowDown size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                  {p.dir === 'up' && <ArrowUp size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                  {p.dir === 'down-left' && <ArrowDownLeft size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                  {p.dir === 'down-right' && <ArrowDownRight size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                  {p.dir === 'up-left' && <ArrowUpLeft size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                  {p.dir === 'up-right' && <ArrowUpRight size={16} strokeWidth={3.2} color="rgba(255,255,255,0.95)" />}
                </div>
              </div>

              {i < segments.length - 1 && (
                // default connector (chevron) to avoid confusion with directional arrows
                <ChevronRight size={20} strokeWidth={3.5} color="rgba(255,255,255,0.85)" />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
