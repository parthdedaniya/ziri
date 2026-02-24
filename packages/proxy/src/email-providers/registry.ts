import type { EmailProvider } from './types.js'

const providers = new Map<string, EmailProvider>()

export function registerEmailProvider(provider: EmailProvider): void {
  providers.set(provider.id, provider)
}

export function getEmailProvider(id: string): EmailProvider | undefined {
  return providers.get(id)
}

export function listEmailProviders(): EmailProvider[] {
  return Array.from(providers.values())
}

