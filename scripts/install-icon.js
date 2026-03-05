#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

function ensureDirs(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function copyFile(src, dst) {
  fs.copyFileSync(src, dst)
  console.log('Copied', src, '->', dst)
}

function tryPngjs(src, outPath) {
  try {
    const { PNG } = require('pngjs')
    const buf = fs.readFileSync(src)
    const srcPng = PNG.sync.read(buf)
    const w = srcPng.width
    const h = srcPng.height
    let outPng = srcPng
    if (srcPng.data.length !== w * h * 4) {
      const newPng = new PNG({ width: w, height: h })
      const srcData = srcPng.data
      const channels = srcData.length / (w * h)
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const idxSrc = Math.floor((y * w + x) * channels)
          const idxDst = (y * w + x) * 4
          newPng.data[idxDst] = srcData[idxSrc] || 0
          newPng.data[idxDst+1] = srcData[idxSrc+1] || 0
          newPng.data[idxDst+2] = srcData[idxSrc+2] || 0
          newPng.data[idxDst+3] = 255
        }
      }
      outPng = newPng
    }
    const outBuf = PNG.sync.write(outPng)
    fs.writeFileSync(outPath, outBuf)
    console.log('Wrote RGBA PNG:', outPath)
    return true
  } catch (e) {
    console.warn('pngjs path unavailable or failed:', e && e.message ? e.message : e)
    return false
  }
}

function main(){
  const repoRoot = path.resolve(__dirname, '..')
  const src = path.join(repoRoot, 'frontend', 'src', 'assets', 'Icon.png')
  const outDir = path.join(repoRoot, 'src-tauri', 'icons')
  const outPath = path.join(outDir, 'icon.png')

  if (!fs.existsSync(src)) {
    console.error('Source icon not found:', src)
    process.exit(1)
  }

  ensureDirs(outDir)

  // Prefer pngjs to ensure proper RGBA PNG. If not available, copy and warn.
  const ok = tryPngjs(src, outPath)
  if (ok) return

  // Try macOS sips as a fallback (will usually produce a PNG but may not add alpha).
  if (process.platform === 'darwin') {
    try {
      execSync(`sips -s format png "${src}" --out "${outPath}"`)
      console.log('Wrote (sips) ', outPath)
      return
    } catch (e) {
      console.warn('sips fallback failed:', e && e.message ? e.message : e)
    }
  }

  // Final fallback: direct copy with warning
  copyFile(src, outPath)
  console.warn('Warning: copied icon without ensuring RGBA. If Tauri fails with "icon is not RGBA", run `npm --prefix frontend install pngjs` and re-run this script.')
}

main()
