// Authentication routes
// Uses new auth table with encryption

import { Router, type Request, type Response } from 'express'
import { getDatabase } from '../db/index.js'
import { generateAccessToken, generateRefreshToken, verifyRefreshToken, hashRefreshToken, type TokenPayload } from '../utils/jwt.js'
import { getMasterKey } from '../utils/master-key.js'
import { decrypt, hash as hashEmail } from '../utils/encryption.js'
import bcrypt from 'bcrypt'

const router: Router = Router()

/**
 * POST /api/auth/admin/login
 * Admin login - looks up users in auth table
 * Also supports master key fallback for initial setup
 */
router.post('/admin/login', async (req: Request, res: Response) => {
  try {
    const { username, password, email } = req.body
    
    // Accept either username or email
    const identifier = username || email
    
    if (!identifier || !password) {
      res.status(400).json({
        error: 'username/email and password are required',
        code: 'MISSING_CREDENTIALS'
      })
      return
    }
    
    const db = getDatabase()
    
    // First, try to find admin user in auth table by email_hash or id
    // For admin, we check if id='admin' (created on first run)
    let user = db.prepare('SELECT * FROM auth WHERE id = ?').get(identifier) as any
    
    // If not found by id, try by email_hash
    if (!user) {
      const emailHash = hashEmail(identifier)
      user = db.prepare('SELECT * FROM auth WHERE email_hash = ?').get(emailHash) as any
    }
    
    // Check if user is admin (id='admin' or we can check role in future)
    // For now, admin is identified by id='admin'
    if (user && user.id === 'admin') {
      // Found admin user - verify password
      if (user.status !== 1) { // 1 = active
        res.status(403).json({
          error: 'Admin account is not active',
          code: 'ACCOUNT_INACTIVE'
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
      
      // Decrypt email
      let decryptedEmail: string
      try {
        decryptedEmail = decrypt(user.email)
      } catch (error: any) {
        decryptedEmail = user.email // Fallback to plain text
      }
      
      // Generate admin token with actual user data
      const tokenPayload: TokenPayload = {
        userId: user.id,
        email: decryptedEmail,
        role: 'admin',
        name: user.name || 'Administrator'
      }
      
      const accessToken = generateAccessToken(tokenPayload)
      const refreshToken = generateRefreshToken(tokenPayload)
      
      // Store refresh token hash in database
      const tokenHash = hashRefreshToken(refreshToken)
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days (sliding window)
      const absoluteExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days (absolute)
      const deviceId = req.body.deviceId || null // Optional device ID
      
      db.prepare(`
        INSERT INTO refresh_tokens (auth_id, token_hash, expires_at, absolute_expires_at, device_id)
        VALUES (?, ?, ?, ?, ?)
      `).run(user.id, tokenHash, expiresAt.toISOString(), absoluteExpiresAt.toISOString(), deviceId)
      
      // Update last login
      db.prepare('UPDATE auth SET last_sign_in = datetime(\'now\') WHERE id = ?').run(user.id)
      
      res.json({
        accessToken,
        refreshToken,
        expiresIn: 3600, // 1 hour in seconds
        tokenType: 'Bearer',
        user: {
          userId: user.id,
          email: decryptedEmail,
          role: 'admin',
          name: user.name || 'Administrator'
        }
      })
      return
    }
    
    // Fallback: Check if using master key (for initial setup when no admin users exist)
    // Only allow this if username is "admin" (backward compatibility)
    if (identifier === 'admin') {
      const masterKey = getMasterKey()
      if (masterKey && password === masterKey) {
        // Generate admin token (legacy mode - no user in database)
        const tokenPayload: TokenPayload = {
          userId: 'admin',
          email: 'admin@zs-ai.local',
          role: 'admin',
          name: 'Administrator'
        }
        
        const accessToken = generateAccessToken(tokenPayload)
        const refreshToken = generateRefreshToken(tokenPayload)
        
        // Store refresh token hash in database
        const tokenHash = hashRefreshToken(refreshToken)
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days (sliding window)
        const absoluteExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days (absolute)
        const deviceId = req.body.deviceId || null // Optional device ID
        
        db.prepare(`
          INSERT INTO refresh_tokens (auth_id, token_hash, expires_at, absolute_expires_at, device_id)
          VALUES (?, ?, ?, ?, ?)
        `).run('admin', tokenHash, expiresAt.toISOString(), absoluteExpiresAt.toISOString(), deviceId)
        
        res.json({
          accessToken,
          refreshToken,
          expiresIn: 3600, // 1 hour in seconds
          tokenType: 'Bearer',
          user: {
            userId: 'admin',
            email: 'admin@zs-ai.local',
            role: 'admin',
            name: 'Administrator'
          }
        })
        return
      }
    }
    
    // No matching admin user or master key
    res.status(401).json({
      error: 'Invalid username/email or password',
      code: 'INVALID_CREDENTIALS'
    })
  } catch (error: any) {
    console.error('[AUTH] Admin login error:', error)
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    })
  }
})

/**
 * POST /api/auth/login
 * Login with userId and password, get JWT tokens (for end users)
 */
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
    
    // Find user by id (auth.id)
    const user = db.prepare('SELECT * FROM auth WHERE id = ?').get(userId) as any
    
    if (!user) {
      res.status(401).json({
        error: 'Invalid userId or password',
        code: 'INVALID_CREDENTIALS'
      })
      return
    }
    
    // Check password
    const passwordMatch = await bcrypt.compare(password, user.password)
    
    if (!passwordMatch) {
      res.status(401).json({
        error: 'Invalid userId or password',
        code: 'INVALID_CREDENTIALS'
      })
      return
    }
    
    // Check if user is active (status = 1)
    if (user.status !== 1) {
      res.status(403).json({
        error: 'User account is not active',
        code: 'USER_INACTIVE'
      })
      return
    }
    
    // Decrypt email
    let decryptedEmail: string
    try {
      decryptedEmail = decrypt(user.email)
    } catch (error: any) {
      decryptedEmail = user.email // Fallback to plain text
    }
    
    // Generate tokens
    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: decryptedEmail,
      role: 'user', // Regular users have role 'user'
      name: user.name || ''
    }
    
    const accessToken = generateAccessToken(tokenPayload)
    const refreshToken = generateRefreshToken(tokenPayload)
    
    // Store refresh token hash in database
    const tokenHash = hashRefreshToken(refreshToken)
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days (sliding window)
    const absoluteExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days (absolute)
    const deviceId = req.body.deviceId || null // Optional device ID
    
    db.prepare(`
      INSERT INTO refresh_tokens (auth_id, token_hash, expires_at, absolute_expires_at, device_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(user.id, tokenHash, expiresAt.toISOString(), absoluteExpiresAt.toISOString(), deviceId)
    
    // Update last login
    db.prepare('UPDATE auth SET last_sign_in = datetime(\'now\') WHERE id = ?').run(user.id)
    
    res.json({
      accessToken,
      refreshToken,
      expiresIn: 3600, // 1 hour in seconds
      tokenType: 'Bearer',
      user: {
        userId: user.id,
        email: decryptedEmail,
        role: 'user',
        name: user.name || ''
      }
    })
  } catch (error: any) {
    console.error('[AUTH] Login error:', error)
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    })
  }
})

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token (with rotation)
 */
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
    
    // Verify refresh token
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
    
    // Check if refresh token exists in database
    const db = getDatabase()
    const tokenHash = hashRefreshToken(refreshToken)
    
    // Find token - check both sliding window and absolute expiry
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
    
    // SECURITY: Check if token was already used (token reuse detection)
    if (storedToken.used_at) {
      console.error(`[AUTH] SECURITY BREACH: Token reuse detected for user ${payload.userId}, token hash: ${tokenHash.substring(0, 8)}...`)
      
      // Revoke ALL refresh tokens for this user (security measure)
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
    
    // Get user to ensure still active
    const user = db.prepare('SELECT * FROM auth WHERE id = ?').get(payload.userId) as any
    
    if (!user || user.status !== 1) { // 1 = active
      res.status(403).json({
        error: 'User account is not active',
        code: 'USER_INACTIVE'
      })
      return
    }
    
    // Decrypt email
    let decryptedEmail: string
    try {
      decryptedEmail = decrypt(user.email)
    } catch (error: any) {
      decryptedEmail = user.email // Fallback to plain text
    }
    
    // Mark old token as used
    db.prepare(`
      UPDATE refresh_tokens 
      SET used_at = datetime('now') 
      WHERE token_hash = ?
    `).run(tokenHash)
    
    // Generate new tokens
    const tokenPayload: TokenPayload = {
      userId: user.id,
      email: decryptedEmail,
      role: user.id === 'admin' ? 'admin' : 'user',
      name: user.name || ''
    }
    
    const newAccessToken = generateAccessToken(tokenPayload)
    const newRefreshToken = generateRefreshToken(tokenPayload)
    
    // Store new refresh token
    const newTokenHash = hashRefreshToken(newRefreshToken)
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days (sliding window)
    // Use original absolute_expires_at (or set to 30 days if not set)
    const newAbsoluteExpiresAt = storedToken.absolute_expires_at 
      ? new Date(storedToken.absolute_expires_at) 
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    
    db.prepare(`
      INSERT INTO refresh_tokens (auth_id, token_hash, expires_at, absolute_expires_at, device_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      user.id, 
      newTokenHash, 
      newExpiresAt.toISOString(), 
      newAbsoluteExpiresAt.toISOString(),
      storedToken.device_id // Preserve device_id
    )
    
    res.json({
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: 3600,
      tokenType: 'Bearer'
    })
  } catch (error: any) {
    console.error('[AUTH] Refresh error:', error)
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    })
  }
})

/**
 * POST /api/auth/logout
 * Revoke refresh token
 */
router.post('/logout', async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body
    
    if (refreshToken) {
      const db = getDatabase()
      const tokenHash = hashRefreshToken(refreshToken)
      
      // Revoke refresh token
      db.prepare(`
        UPDATE refresh_tokens 
        SET revoked_at = datetime('now') 
        WHERE token_hash = ?
      `).run(tokenHash)
    }
    
    res.json({ success: true })
  } catch (error: any) {
    console.error('[AUTH] Logout error:', error)
    res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR'
    })
  }
})

export default router
