import { getDatabase } from '../db/index.js'
import { encrypt, decrypt } from '../utils/encryption.js'
import { validateProviderApiKey } from '../config/index.js'
import { randomBytes } from 'crypto'

export interface ProviderMetadata {
  name: string
  displayName: string
  baseUrl: string
  models: string[]
  defaultModel: string
}

export interface Provider {
  id: string
  name: string
  displayName: string
  baseUrl: string
  models: string[]
  defaultModel: string
  hasCredentials: boolean
  createdAt: string
  updatedAt: string
}

export interface CreateProviderInput {
  name: string
  apiKey: string
  metadata?: Partial<ProviderMetadata>
}

const PROVIDER_TEMPLATES: Record<string, Omit<ProviderMetadata, 'name'>> = {
  openai: {
    displayName: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-3.5-turbo-16k'],
    defaultModel: 'gpt-4'
  },
  anthropic: {
    displayName: 'Anthropic',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku'],
    defaultModel: 'claude-3-opus'
  },
  google: {
    displayName: 'Google (Gemini)',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
    models: [
      'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
      'gemini-2.0-flash', 'gemini-2.0-flash-lite',
      'gemini-1.5-pro', 'gemini-1.5-pro-latest', 'gemini-1.5-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash-8b'
    ],
    defaultModel: 'gemini-2.5-pro'
  },
  xai: {
    displayName: 'xAI (Grok)',
    baseUrl: 'https://api.x.ai/v1',
    models: [
      'grok-4', 'grok-4-fast-reasoning', 'grok-4-fast-non-reasoning',
      'grok-3', 'grok-3-mini', 'grok-vision-beta'
    ],
    defaultModel: 'grok-4'
  },
  mistral: {
    displayName: 'Mistral',
    baseUrl: 'https://api.mistral.ai/v1',
    models: [
      'mistral-large-3', 'mistral-large-latest', 'mistral-medium-2505',
      'mistral-small', 'mistral-nemo', 'mistral-small-2503'
    ],
    defaultModel: 'mistral-large-3'
  },
  moonshot: {
    displayName: 'Kimi (Moonshot)',
    baseUrl: 'https://api.moonshot.ai/v1',
    models: [
      'kimi-k2.5', 'kimi-k2-thinking', 'kimi-k2-thinking-turbo',
      'kimi-k2-0905-preview', 'kimi-k2-0711-preview', 'kimi-k2-turbo-preview'
    ],
    defaultModel: 'kimi-k2.5'
  },
  deepseek: {
    displayName: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: [
      'deepseek-chat', 'deepseek-reasoner', 'deepseek-v3.2', 'deepseek-v3',
      'deepseek-r1', 'deepseek-coder'
    ],
    defaultModel: 'deepseek-chat'
  },
  dashscope: {
    displayName: 'Qwen (DashScope)',
    baseUrl: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1',
    models: [
      'qwen-max', 'qwen-plus-latest', 'qwen-plus', 'qwen-turbo-latest', 'qwen-turbo',
      'qwen3-max', 'qwen3-coder-plus', 'qwen3-coder-flash'
    ],
    defaultModel: 'qwen-plus-latest'
  },
  openrouter: {
    displayName: 'OpenRouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    models: [
      'anthropic/claude-sonnet-4.5', 'anthropic/claude-3.5-sonnet', 'openai/gpt-4o',
      'google/gemini-2.5-pro', 'deepseek/deepseek-chat', 'x-ai/grok-4',
      'mistralai/mistral-large-2512', 'moonshotai/kimi-k2.5'
    ],
    defaultModel: 'anthropic/claude-sonnet-4.5'
  },
  vertex_ai: {
    displayName: 'Vertex AI (Google Cloud)',
    baseUrl: 'https://us-central1-aiplatform.googleapis.com/v1/projects/{project}/locations/us-central1/publishers/google/models/{model}:generateContent',
    models: [
      'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash',
      'chat-bison', 'code-bison', 'text-bison'
    ],
    defaultModel: 'gemini-2.5-pro'
  }
}


export function createOrUpdateProvider(input: CreateProviderInput): Provider {
  const db = getDatabase()
  const providerName = input.name.toLowerCase()

  const validation = validateProviderApiKey(providerName, input.apiKey)
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid API key format')
  }

  const template = PROVIDER_TEMPLATES[providerName]
  const metadata: ProviderMetadata = {
    name: providerName,
    displayName: input.metadata?.displayName || template?.displayName || providerName,
    baseUrl: input.metadata?.baseUrl || template?.baseUrl || '',
    models: input.metadata?.models || template?.models || [],
    defaultModel: input.metadata?.defaultModel || template?.defaultModel || ''
  }

  const encryptedApiKey = encrypt(input.apiKey)

  const existing = db.prepare('SELECT * FROM provider_keys WHERE provider = ?').get(providerName) as any

  if (existing) {
    db.prepare(`
      UPDATE provider_keys 
      SET api_key = ?, metadata = ?, updated_at = datetime('now')
      WHERE provider = ?
    `).run(encryptedApiKey, JSON.stringify(metadata), providerName)
  } else {

    const providerId = `provider-${randomBytes(8).toString('hex')}`
    db.prepare(`
      INSERT INTO provider_keys (id, provider, api_key, metadata)
      VALUES (?, ?, ?, ?)
    `).run(providerId, providerName, encryptedApiKey, JSON.stringify(metadata))
  }

  return getProvider(providerName)!
}


export function listProviders(params?: {
  search?: string
  limit?: number
  offset?: number
  sortBy?: string | null
  sortOrder?: 'asc' | 'desc' | null
}): { data: Provider[]; total: number } {
  const db = getDatabase()

  let whereClause = 'WHERE 1=1'
  const args: any[] = []

  if (params?.search) {
    const searchPattern = `%${params.search}%`

    whereClause += ' AND provider LIKE ?'
    args.push(searchPattern)
  }

  let orderByClause = 'ORDER BY created_at DESC'
  if (params?.sortBy && params?.sortOrder) {

    const columnMap: Record<string, string> = {
      'name': 'provider',
      'displayName': 'provider',
      'createdAt': 'created_at',
      'updatedAt': 'updated_at'
    }
    const dbColumn = columnMap[params.sortBy]
    if (dbColumn) {
      const order = params.sortOrder.toUpperCase()
      orderByClause = `ORDER BY ${dbColumn} ${order}`
    }
  }

  const countSql = `SELECT COUNT(*) as total FROM provider_keys ${whereClause}`
  const countResult = db.prepare(countSql).get(...args) as { total: number }
  let total = countResult.total

  const limit = params?.limit || 100
  const offset = params?.offset || 0
  const dataSql = `SELECT * FROM provider_keys ${whereClause} ${orderByClause} LIMIT ? OFFSET ?`
  const providers = db.prepare(dataSql).all(...args, limit, offset) as any[]

  let mappedProviders = providers.map(mapDbProviderToProvider)

  if (params?.search) {
    const searchLower = params.search.toLowerCase()
    mappedProviders = mappedProviders.filter(provider =>
      provider.name.toLowerCase().includes(searchLower) ||
      provider.displayName.toLowerCase().includes(searchLower) ||
      provider.baseUrl.toLowerCase().includes(searchLower)
    )

    const allProviders = db.prepare('SELECT * FROM provider_keys').all() as any[]
    const allMapped = allProviders.map(mapDbProviderToProvider)
    const filtered = allMapped.filter(provider =>
      provider.name.toLowerCase().includes(searchLower) ||
      provider.displayName.toLowerCase().includes(searchLower) ||
      provider.baseUrl.toLowerCase().includes(searchLower)
    )

    if (params?.sortBy && params?.sortOrder) {
      const sortKey = params.sortBy as keyof Provider
      mappedProviders.sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        if (aVal === undefined || aVal === null) return 1
        if (bVal === undefined || bVal === null) return -1

        if (typeof aVal === 'string' && typeof bVal === 'string') {
          const comparison = aVal.toLowerCase().localeCompare(bVal.toLowerCase())
          return params.sortOrder === 'asc' ? comparison : -comparison
        }
        const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0
        return params.sortOrder === 'asc' ? comparison : -comparison
      })
    }

    return { data: mappedProviders, total: filtered.length }
  }

  return { data: mappedProviders, total }
}

export function getProvider(name: string): Provider | null {
  const db = getDatabase()
  const provider = db.prepare('SELECT * FROM provider_keys WHERE provider = ?').get(name.toLowerCase()) as any
  return provider ? mapDbProviderToProvider(provider) : null
}

export function getProviderApiKey(name: string): string | null {
  const db = getDatabase()
  const provider = db.prepare('SELECT api_key FROM provider_keys WHERE provider = ?').get(name.toLowerCase()) as any

  if (!provider || !provider.api_key) {
    return null
  }

  try {
    return decrypt(provider.api_key)
  } catch (error: any) {
    console.error(`[PROVIDER] Failed to decrypt API key for ${name}:`, error)
    return null
  }
}


export function deleteProvider(name: string): void {
  const db = getDatabase()
  const result = db.prepare('DELETE FROM provider_keys WHERE provider = ?').run(name.toLowerCase())
  if (result.changes === 0) {
    throw new Error('Provider not found')
  }
}


export async function testProviderApiKey(name: string): Promise<{ success: boolean; error?: string }> {
  const apiKey = getProviderApiKey(name)

  if (!apiKey) {
    return { success: false, error: 'Provider API key not found or decryption failed' }
  }

  const provider = getProvider(name)
  if (!provider) {
    return { success: false, error: 'Provider not found' }
  }

  try {
    const openaiCompatible = ['openai', 'google', 'xai', 'mistral', 'moonshot', 'deepseek', 'dashscope', 'openrouter']
    if (openaiCompatible.includes(name.toLowerCase()) && provider.baseUrl) {
      const modelsUrl = provider.baseUrl.endsWith('/') ? `${provider.baseUrl}models` : `${provider.baseUrl}/models`
      const response = await fetch(modelsUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      })
      if (response.ok) {
        return { success: true }
      }
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' })) as any
      return { success: false, error: errorData?.error?.message || 'API key validation failed' }
    }

    return { success: true }
  } catch (error: any) {
    return { success: false, error: error.message || 'Failed to validate API key' }
  }
}


function mapDbProviderToProvider(dbProvider: any): Provider {
  let metadata: ProviderMetadata = {
    name: dbProvider.provider,
    displayName: dbProvider.provider,
    baseUrl: '',
    models: [],
    defaultModel: ''
  }

  if (dbProvider.metadata) {
    try {
      const parsed = JSON.parse(dbProvider.metadata)
      metadata = { ...metadata, ...parsed }
    } catch (error: any) {
      console.warn(`[PROVIDER] Failed to parse metadata for ${dbProvider.provider}:`, error.message)
    }
  }

  return {
    id: dbProvider.id,
    name: dbProvider.provider,
    displayName: metadata.displayName,
    baseUrl: metadata.baseUrl,
    models: metadata.models,
    defaultModel: metadata.defaultModel,
    hasCredentials: !!dbProvider.api_key,
    createdAt: dbProvider.created_at,
    updatedAt: dbProvider.updated_at
  }
}
