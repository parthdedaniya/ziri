import { createServer } from 'net'

const LOCALHOST = '127.0.0.1'
const PORT_CHECK_TIMEOUT_MS = 1_500

export function isPortAvailable(port: number, host: string = LOCALHOST): Promise<boolean> {
  return new Promise(resolve => {
    const server = createServer()
    let settled = false
    let timer: NodeJS.Timeout | null = null

    const finish = (result: boolean) => {
      if (settled) return
      settled = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }

      if (server.listening) {
        server.close(() => resolve(result))
      } else {
        resolve(result)
      }
    }

    timer = setTimeout(() => finish(false), PORT_CHECK_TIMEOUT_MS)

    server.once('listening', () => finish(true))
    server.once('error', (err: NodeJS.ErrnoException) => {
      if (err.code !== 'EADDRINUSE' && err.code !== 'EACCES') {
        console.warn(`port check failed for ${port}: ${err.message}`)
      }
      finish(false)
    })

    server.listen(port, host)
  })
}

export async function findFreePort(startPort: number, maxAttempts: number = 100): Promise<number> {
  if (!Number.isInteger(startPort) || startPort <= 0) {
    throw new Error('startPort must be a positive integer')
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('maxAttempts must be a positive integer')
  }

  for (let i = 0; i < maxAttempts; i++) {
    const candidate = startPort + i
    if (await isPortAvailable(candidate)) {
      return candidate
    }
  }

  throw new Error(`Could not find available port starting from ${startPort} after ${maxAttempts} attempts`)
}
