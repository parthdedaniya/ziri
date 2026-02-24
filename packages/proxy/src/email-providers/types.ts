export interface EmailOptions {
  to: string
  subject: string
  html: string
  text?: string
}

export type ProviderFieldType = 'text' | 'password' | 'number' | 'checkbox' | 'url'

export interface ProviderField {
  key: string
  label: string
  type: ProviderFieldType
  required?: boolean
  placeholder?: string
  help?: string
}

export interface EmailProvider {
  id: string
  label: string
  fields: ProviderField[]
  fromRequired?: boolean
  send(options: EmailOptions, cfg: Record<string, unknown>, from?: string): Promise<boolean>
}

