import { initializeRootKey } from './utils/root-key.js'
import { initializeEncryptionKey } from './utils/encryption-key.js'
import { getDatabase, closeDatabase } from './db/index.js'
import { loadConfig } from './config.js'
import { startServer, stopServer } from './server.js'
import { serviceFactory } from './services/service-factory.js'
import { seedDefaults } from './db/seed.js'

const rootKey = initializeRootKey()
const encryptionKey = initializeEncryptionKey()
getDatabase()

const config = loadConfig()
serviceFactory.initialize()

import('./db/index.js').then(({ initializeAdminUser }) => {
  initializeAdminUser().catch(err => console.warn('admin init failed:', err))
}).catch(err => console.warn('admin module load failed:', err))

if (config.mode === 'local') {
  import('./db/index.js').then(async ({ ensureSchemaInitialized }) => {
    await ensureSchemaInitialized()
    return seedDefaults()
  }).catch(err => console.warn('seed failed:', err))
}

import { fileURLToPath } from 'url'
import { pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const isMainModule = process.argv[1] &&
  (fileURLToPath(import.meta.url) === fileURLToPath(pathToFileURL(process.argv[1]).href) ||
   process.argv[1].endsWith('index.js') ||
   process.argv[1].endsWith('index.ts'))

if (isMainModule) {
  startServer().catch(err => { console.error('startup failed:', err); process.exit(1) })
}

async function shutdown() {
  await stopServer()
  const { eventEmitterService } = await import('./services/event-emitter-service.js')
  eventEmitterService.destroy()
  closeDatabase()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

export { config, rootKey }
