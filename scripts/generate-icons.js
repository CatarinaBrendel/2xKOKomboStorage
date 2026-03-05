#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

async function run(){
  const repoRoot = path.resolve(__dirname, '..')
  const src = path.join(repoRoot, 'frontend', 'src', 'assets', 'Icon.png')
  const outDir = path.join(repoRoot, 'src-tauri', 'icons')

  if (!fs.existsSync(src)) {
    console.error('Source icon not found:', src)
    process.exit(1)
  }

  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  // Try to use sharp if available (fast, resizes). If not, fall back to pngjs-based simple copy + ensure-alpha.
  let sharpAvailable = false
  try {
    require.resolve('sharp')
    sharpAvailable = true
  } catch (e) {
    sharpAvailable = false
  }

  if (sharpAvailable) {
    try {
      const sharp = require('sharp')
      const pngToIco = (() => { try { return require('png-to-ico') } catch (e) { return null } })()
      const sizes = [16, 32, 48, 64, 128, 256, 512]
      console.log('Generating PNG icons in', outDir)
      const pngBuffers = {}
      for (const s of sizes) {
        const outPath = path.join(outDir, `${s}x${s}.png`)
        await sharp(src)
          .resize(s, s, { fit: 'cover' })
          .ensureAlpha()
          .png()
          .toFile(outPath)
        pngBuffers[s] = fs.readFileSync(outPath)
        console.log('Wrote', outPath)
      }

      // 128x128@2x -> 256x256 name used by older setups
      const out1282 = path.join(outDir, `128x128@2x.png`)
      fs.copyFileSync(path.join(outDir, '256x256.png'), out1282)

      // copy large icon as icon.png
      const iconPng = path.join(outDir, 'icon.png')
      fs.copyFileSync(path.join(outDir, '512x512.png'), iconPng)
      console.log('Wrote', iconPng)

      // generate .ico if possible
      if (pngToIco) {
        try {
          const icoBuf = await pngToIco([pngBuffers[16], pngBuffers[32], pngBuffers[48], pngBuffers[64], pngBuffers[128], pngBuffers[256]])
          const icoPath = path.join(outDir, 'icon.ico')
          fs.writeFileSync(icoPath, icoBuf)
          console.log('Wrote', icoPath)
        } catch (e) {
          console.warn('png-to-ico failed:', e && e.message ? e.message : e)
        }
      }

      // attempt to create .icns on macOS if iconutil is available
      if (process.platform === 'darwin') {
        try {
          const iconset = path.join(outDir, 'icon.iconset')
          if (fs.existsSync(iconset)) {
            fs.rmSync(iconset, { recursive: true })
          }
          fs.mkdirSync(iconset)
          const mapping = [16,32,64,128,256,512]
          mapping.forEach((s) => {
            const name = `icon_${s}x${s}.png`
            fs.copyFileSync(path.join(outDir, `${s}x${s}.png`), path.join(iconset, name))
          })
          const icnsPath = path.join(outDir, 'icon.icns')
          try {
            execSync(`iconutil -c icns ${iconset} -o ${icnsPath}`)
            console.log('Wrote', icnsPath)
          } catch (e) {
            console.warn('iconutil failed:', e && e.message ? e.message : e)
          }
        } catch (e) {
          console.warn('icns generation failed:', e && e.message ? e.message : e)
        }
      }

      console.log('Icon generation complete (sharp)')
      return
    } catch (err) {
      console.warn('sharp flow failed, falling back to pngjs:', err && err.message ? err.message : err)
    }
  }

  // Fallback: use pngjs to ensure alpha channel and copy to icons/icon.png
  try {
    const { PNG } = require('pngjs')
    const buf = fs.readFileSync(src)
    const srcPng = PNG.sync.read(buf)
    const w = srcPng.width
    const h = srcPng.height
    let outPng = srcPng
    // If data length is not w*h*4, convert to RGBA by expanding
    if (srcPng.data.length !== w * h * 4) {
      const newPng = new PNG({ width: w, height: h })
      // assume srcPng has 3 channels (RGB)
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

    const outPath = path.join(outDir, 'icon.png')
    const outBuf = PNG.sync.write(outPng)
    fs.writeFileSync(outPath, outBuf)
    console.log('Wrote (fallback) ', outPath)
    console.log('Icon generation complete (fallback)')
    return
  } catch (e) {
    console.error('generate-icons fallback failed:', e && e.message ? e.message : e)
    process.exit(1)
  }
}

run().catch((err) => {
  console.error('generate-icons unexpected error:', err && err.message ? err.message : err)
  process.exit(1)
})
