import { createServer, type Server } from 'net'

export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server: Server = createServer()
    const timeout = setTimeout(() => {
      server.close()
      resolve(false)
    }, 1000)
    server.once('listening', () => {
      clearTimeout(timeout)
      server.once('close', () => resolve(true))
      server.close()
    })
    server.once('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timeout)
      if (err.code === 'EADDRINUSE' || err.code === 'EACCES') {
        resolve(false)
      } else {
        resolve(false)
      }
    })
    server.listen(port, '127.0.0.1')
  })
}


export async function findFreePort(startPort: number, maxAttempts: number = 100): Promise<number> {
  console.log(`[PORT] Checking port ${startPort}...`)
  for (let i = 0; i < maxAttempts; i++) {
    const port = startPort + i
    const available = await isPortAvailable(port)
    if (available) {
      if (i > 0) {
        console.log(`[PORT] Port ${startPort} is in use, using port ${port} instead`)
      } else {
        console.log(`[PORT] Port ${port} is available`)
      }
      return port
    }
    if (i > 0 && i % 10 === 0) {
      console.log(`[PORT] Still searching for free port... (tried ${i + 1} ports)`)
    }
  }
  throw new Error(`Could not find available port starting from ${startPort} after ${maxAttempts} attempts`)
}
