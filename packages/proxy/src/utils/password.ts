 

import bcrypt from 'bcrypt'
import { randomBytes } from 'crypto'

const SALT_ROUNDS = 10

 
export function generatePassword(length: number = 16): string {
 
  const bytes = randomBytes(length)
  return bytes.toString('base64').slice(0, length)
}

 
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS)
}

 
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}
