export interface UserSDKConfig {
  apiKey: string
  proxyUrl?: string
}

export class UserSDK {
  private config: UserSDKConfig
  private userId: string

  constructor(config: UserSDKConfig) {
    let finalConfig = { ...config }
    
    if (!finalConfig.proxyUrl) {
      finalConfig.proxyUrl = process.env.ZS_AI_PROXY_URL || 'http://localhost:3100'
    }
    
 
    if (!finalConfig.apiKey) {
      throw new Error('apiKey is required')
    }
    
    if (!finalConfig.proxyUrl) {
      throw new Error('proxyUrl is required. Provide in config or set ZS_AI_PROXY_URL env var')
    }
    
 
    this.validateApiKey(finalConfig.apiKey)
    
 
    this.userId = this.extractUserId(finalConfig.apiKey)
    
    this.config = finalConfig
  }

  private validateApiKey(apiKey: string): void {
    if (!apiKey.startsWith('sk-zs-')) {
      throw new Error('Invalid API key format. Expected format: sk-zs-{userId}-{hash}')
    }
  }

  private extractUserId(apiKey: string): string {
 
    const parts = apiKey.substring(6).split('-')
    if (parts.length < 2) {
      throw new Error('Invalid API key format')
    }
    return parts[0] // userId is the first part after sk-zs-
  }


   
  async chatCompletions(params: {
    provider: string
    model: string
    messages: Array<{ role: string; content: string }>
    ipAddress?: string
    context?: Record<string, any>
    [key: string]: any
  }): Promise<any> {
 
    const response = await fetch(`${this.config.proxyUrl}/api/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.config.apiKey
      },
      body: JSON.stringify({
        provider: params.provider,
        model: params.model,
        messages: params.messages,
        ...Object.fromEntries(
          Object.entries(params).filter(([key]) => 
            !['provider', 'ipAddress', 'context'].includes(key)
          )
        )
      })
    })
    
    if (!response.ok) {
      const error = await response.text()
      throw new Error(`Request failed: ${response.status} ${error}`)
    }
    
    return response.json()
  }

   
  getUserId(): string {
    return this.userId
  }
}
