import { copyFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const uiSourcePath = join(__dirname, '../../ui/.output/public')
const uiDestPath = join(__dirname, '../dist/ui')

function copyRecursive(src, dest) {
  if (!existsSync(src)) {
    console.warn(`[COPY-UI] Source not found: ${src}`)
    return false
  }
  
  const stats = statSync(src)
  
  if (stats.isDirectory()) {
    if (!existsSync(dest)) {
      mkdirSync(dest, { recursive: true })
    }
    
    const entries = readdirSync(src)
    for (const entry of entries) {
      copyRecursive(join(src, entry), join(dest, entry))
    }
  } else {
    const destDir = dirname(dest)
    if (!existsSync(destDir)) {
      mkdirSync(destDir, { recursive: true })
    }
    copyFileSync(src, dest)
  }
  
  return true
}

console.log('[COPY-UI] Copying UI assets...')
console.log(`  From: ${uiSourcePath}`)
console.log(`  To: ${uiDestPath}`)

if (!existsSync(uiSourcePath)) {
  console.warn('[COPY-UI] ⚠️  UI source not found. Skipping UI copy.')
  console.warn('[COPY-UI] Run "npm run build:ui" first for bundled UI.')
  console.warn('[COPY-UI] Proxy will still work, but UI must be served separately.')
  process.exit(0)
}

try {
  copyRecursive(uiSourcePath, uiDestPath)
  console.log('[COPY-UI] ✅ UI assets copied successfully')
} catch (error) {
  console.error('[COPY-UI] ❌ Failed to copy UI assets:', error)
  process.exit(1)
}
