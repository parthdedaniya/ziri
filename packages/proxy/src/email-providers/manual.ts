import type { EmailProvider, EmailOptions } from './types.js'

export const manualProvider: EmailProvider = {
  id: 'manual',
  label: 'Manual',
  fields: [],
  async send(_options: EmailOptions, _cfg: Record<string, unknown>): Promise<boolean> {
    return true
  }
}

