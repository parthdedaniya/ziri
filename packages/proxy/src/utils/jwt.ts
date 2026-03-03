 

import jwt from 'jsonwebtoken'
import { getRootKey } from './root-key.js'
import { createHash, randomUUID } from 'crypto'

const JWT_SECRET_KEY = 'jwt-secret'
const ACCESS_TOKEN_EXPIRY = '1h'
const REFRESH_TOKEN_EXPIRY = '7d'

export interface TokenPayload {
  userId: string
  email?: string
  role?: string
  name?: string
}

 
function getJwtSecret(): string {
 
  const rootKey = getRootKey()
  if (!rootKey) {
    throw new Error('Root key not found')
  }
  return createHash('sha256').update(rootKey + JWT_SECRET_KEY).digest('hex')
}

 
export function generateAccessToken(payload: TokenPayload): string {
  const secret = getJwtSecret()
  return jwt.sign(payload, secret, {
    expiresIn: ACCESS_TOKEN_EXPIRY,
    issuer: 'ziri-proxy'
  })
}

 
export function generateRefreshToken(payload: TokenPayload): string {
  const secret = getJwtSecret()
  return jwt.sign(payload, secret, {
    expiresIn: REFRESH_TOKEN_EXPIRY,
    issuer: 'ziri-proxy',
    jwtid: randomUUID()
  })
}

 
export function verifyAccessToken(token: string): TokenPayload {
  const secret = getJwtSecret()
  try {
    const decoded = jwt.verify(token, secret, {
      issuer: 'ziri-proxy'
    }) as TokenPayload
    return decoded
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Token expired')
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid token')
    }
    throw error
  }
}

 
export function verifyRefreshToken(token: string): TokenPayload {
  const secret = getJwtSecret()
  try {
    const decoded = jwt.verify(token, secret, {
      issuer: 'ziri-proxy'
    }) as TokenPayload
    return decoded
  } catch (error: any) {
    if (error.name === 'TokenExpiredError') {
      throw new Error('Refresh token expired')
    }
    if (error.name === 'JsonWebTokenError') {
      throw new Error('Invalid refresh token')
    }
    throw error
  }
}

 
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
