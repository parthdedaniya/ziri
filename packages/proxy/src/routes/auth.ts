import { Router, type Request, type Response } from 'express'
import { getDatabase } from '../db/index.js'
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, hashRefreshToken, type TokenPayload } from '../utils/jwt.js'
import { getRootKey } from '../utils/root-key.js'
import { decrypt, hash as hashEmail } from '../utils/encryption.js'
import bcrypt from 'bcrypt'

const router: Router = Router()

const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000
const ABSOLUTE_REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000
const ACCESS_TOKEN_TTL_SECONDS = 3600

interface SessionTokens {
  accessToken: string
  refreshToken: string
  expiresIn: number
  tokenType: 'Bearer'
}

function decryptEmailOrFallback(value: string): string {
  try {
    return decrypt(value)
  } catch {
    return value
  }
}

function findAuthUserByIdentifier(db: ReturnType<typeof getDatabase>, identifier: string): any | null {
  let user = db.prepare('SELECT * FROM auth WHERE id = ?').get(identifier) as any
  if (!user) {
    const emailHash = hashEmail(identifier)
    user = db.prepare('SELECT * FROM auth WHERE email_hash = ?').get(emailHash) as any
  }
  return user || null
}

function persistRefreshToken(db: ReturnType<typeof getDatabase>, params: {
  authId: string
  refreshToken: string
  deviceId: string | null
  absoluteExpiresAt?: Date
}): void {
  const tokenHash = hashRefreshToken(params.refreshToken)
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS)
  const absoluteExpiresAt = params.absoluteExpiresAt || new Date(Date.now() + ABSOLUTE_REFRESH_TOKEN_TTL_MS)

  db.prepare(`
    INSERT INTO refresh_tokens (auth_id, token_hash, expires_at, absolute_expires_at, device_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    params.authId,
    tokenHash,
    expiresAt.toISOString(),
    absoluteExpiresAt.toISOString(),
    params.deviceId
  )
}

function issueSessionTokens(db: ReturnType<typeof getDatabase>, params: {
  authId: string
  payload: TokenPayload
  deviceId: string | null
  absoluteExpiresAt?: Date
}): SessionTokens {
  const accessToken = generateAccessToken(params.payload)
  const refreshToken = generateRefreshToken(params.payload)

  persistRefreshToken(db, {
    authId: params.authId,
    refreshToken,
    deviceId: params.deviceId,
    absoluteExpiresAt: params.absoluteExpiresAt
  })

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    tokenType: 'Bearer'
  }
}

function isDashboardUser(user: any): boolean {
  return user && user.role !== null && user.role !== undefined
}

router.post('/admin/login', async (req: Request, res: Response) => {
  try {
    const { username, password, email } = req.body
    const identifier = username || email

    if (!identifier || !password) {
      res.status(400).json({
        error: 'username/email and password are required',
        code: 'MISSING_CREDENTIALS'
      })
      return
    }

    const db = getDatabase()
    const user = findAuthUserByIdentifier(db, identifier)

    if (isDashboardUser(user)) {
      if (user.status !== 1) {
        res.status(403).json({
          error: 'Account is disabled',
          code: 'ACCOUNT_DISABLED'
        })
        return
      }

      const passwordMatch = await bcrypt.compare(password, user.password)
      if (!passwordMatch) {
        res.status(401).json({
          error: 'Invalid username/email or password',
          code: 'INVALID_CREDENTIALS'
        })
        return
      }

      const decryptedEmail = decryptEmailOrFallback(user.email)
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: decryptedEmail,
        role: user.role,
        name: user.name || 'Administrator'
      }

      const session = issueSessionTokens(db, {
        authId: user.id,
        payload: tokenPayload,
        deviceId: req.body.deviceId || null
      })

      db.prepare('UPDATE auth SET last_sign_in = datetime(\'now\') WHERE id = ?').run(user.id)

      res.json({
        ...session,
        user: {
          userId: user.id,
          email: decryptedEmail,
          role: user.role,
          name: user.name || 'Administrator'
        }
      })
      return
    }

    if (identifier === 'ziri') {
      const rootKey = getRootKey()
      if (rootKey && password === rootKey) {
        const tokenPayload: TokenPayload = {
          userId: 'ziri',
          email: 'ziri@ziri.local',
          role: 'admin',
          name: 'Administrator'
        }

        const session = issueSessionTokens(db, {
          authId: 'ziri',
          payload: tokenPayload,
          deviceId: req.body.deviceId || null
        })

        res.json({
          ...session,
          user: {
            userId: 'ziri',
            email: 'ziri@ziri.local',
            role: 'admin',
            name: 'Administrator'
          }
        })
        return
      }

      console.log('root key authentication failed for ziri')
      if (!rootKey) {
        console.error('root key is null or undefined')
      } else if (password !== rootKey) {
        console.error('password does not match root key')
        console.error(`expected key (first 8): ${rootKey.substring(0, 8)}...`)
        console.error(`provided password (first 8): ${password?.substring(0, 8)}...`)
      }
    }

    res.status(401).json({
      error: 'Invalid username/email or password',
      code: 'INVALID_CREDENTIALS'
    })
  } catch (error: any) {
    console.error('admin login failed:', error)
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    })
  }
})

router.post('/login', async (req: Request, res: Response) => {
  try {
    const { userId, password } = req.body

    if (!userId || !password) {
      res.status(400).json({
        error: 'userId and password are required',
        code: 'MISSING_CREDENTIALS'
      })
      return
    }

    const db = getDatabase()
    const user = db.prepare('SELECT * FROM auth WHERE id = ?').get(userId) as any

    if (!user) {
      res.status(401).json({
        error: 'Invalid userId or password',
        code: 'INVALID_CREDENTIALS'
      })
      return
    }

    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) {
      res.status(401).json({
        error: 'Invalid userId or password',
        code: 'INVALID_CREDENTIALS'
      })
      return
    }

    if (user.status !== 1) {
      res.status(403).json({
        error: 'User account is not active',
        code: 'USER_INACTIVE'
      })
      return
    }

    const decryptedEmail = decryptEmailOrFallback(user.email)
    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: decryptedEmail,
      role: 'user',
      name: user.name || ''
    }

    const session = issueSessionTokens(db, {
      authId: user.id,
      payload: tokenPayload,
      deviceId: req.body.deviceId || null
    })

    db.prepare('UPDATE auth SET last_sign_in = datetime(\'now\') WHERE id = ?').run(user.id)

    res.json({
      ...session,
      user: {
        userId: user.id,
        email: decryptedEmail,
        role: 'user',
        name: user.name || ''
      }
    })
  } catch (error: any) {
    console.error('login failed:', error)
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    })
  }
})

router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body

    if (!refreshToken) {
      res.status(400).json({
        error: 'refreshToken is required',
        code: 'MISSING_REFRESH_TOKEN'
      })
      return
    }

    let payload: TokenPayload
    try {
      payload = verifyRefreshToken(refreshToken)
    } catch (error: any) {
      res.status(401).json({
        error: error.message || 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      })
      return
    }

    const db = getDatabase()
    const tokenHash = hashRefreshToken(refreshToken)

    const storedToken = db.prepare(`
      SELECT * FROM refresh_tokens
      WHERE token_hash = ?
        AND revoked_at IS NULL
        AND expires_at > datetime('now')
        AND (absolute_expires_at IS NULL OR absolute_expires_at > datetime('now'))
    `).get(tokenHash) as any

    if (!storedToken) {
      res.status(401).json({
        error: 'Refresh token not found or expired',
        code: 'REFRESH_TOKEN_INVALID'
      })
      return
    }

    if (storedToken.used_at) {
      console.error(`token reuse detected for user ${payload.userId}, token hash: ${tokenHash.substring(0, 8)}...`)

      db.prepare(`
        UPDATE refresh_tokens
        SET revoked_at = datetime('now')
        WHERE auth_id = ? AND revoked_at IS NULL
      `).run(payload.userId)

      res.status(401).json({
        error: 'Token reuse detected, all sessions invalidated. Please login again.',
        code: 'TOKEN_REUSE_DETECTED'
      })
      return
    }

    const user = db.prepare('SELECT * FROM auth WHERE id = ?').get(payload.userId) as any
    if (!user || user.status !== 1) {
      res.status(403).json({
        error: 'User account is not active',
        code: 'USER_INACTIVE'
      })
      return
    }

    const decryptedEmail = decryptEmailOrFallback(user.email)

    db.prepare(`
      UPDATE refresh_tokens
      SET used_at = datetime('now')
      WHERE token_hash = ?
    `).run(tokenHash)

    let userRole: string
    if (user.role !== null && user.role !== undefined) {
      try {
        const { internalEntityStore } = await import('../services/internal/internal-entity-store.js')
        const entity = await internalEntityStore.getEntity(user.id)
        userRole = entity ? entity.attrs.role : user.role
      } catch (error: any) {
        console.warn('failed to fetch role from entity store, using db role:', error.message)
        userRole = user.role
      }
    } else {
      userRole = 'user'
    }

    const nextTokenPayload: TokenPayload = {
      userId: user.id,
      email: decryptedEmail,
      role: userRole,
      name: user.name || ''
    }

    const absoluteExpiresAt = storedToken.absolute_expires_at
      ? new Date(storedToken.absolute_expires_at)
      : undefined

    const session = issueSessionTokens(db, {
      authId: user.id,
      payload: nextTokenPayload,
      deviceId: storedToken.device_id,
      absoluteExpiresAt
    })

    res.json(session)
  } catch (error: any) {
    console.error('token refresh failed:', error)
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    })
  }
})

router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body

    if (refreshToken) {
      const db = getDatabase()
      const tokenHash = hashRefreshToken(refreshToken)

      db.prepare(`
        UPDATE refresh_tokens
        SET revoked_at = datetime('now')
        WHERE token_hash = ?
      `).run(tokenHash)
    }

    res.json({ success: true })
  } catch (error: any) {
    console.error('logout failed:', error)
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    })
  }
})

export default router
