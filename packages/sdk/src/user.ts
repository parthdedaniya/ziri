// User SDK - for making LLM calls with authorization
// Updated for new architecture: JWT auth + API key, proxy server, PDP-only

import { readConfig } from '@zs-ai/config'

export interface UserSDKConfig {
  apiKey: string  // API key (sk-zs-{userId}-{hash}) - REQUIRED
  proxyUrl?: string  // Optional: Proxy server URL (e.g., http://localhost:3100)
  // If proxyUrl not provided, will try to load from config or env
}

export class UserSDK {
  private config: UserSDKConfig
  private userId: string

  constructor(config: UserSDKConfig) {
    // Auto-load from config file if not provided
    let finalConfig = { ...config }
    
    if (!finalConfig.proxyUrl) {
      const fileConfig = readConfig()
      if (fileConfig) {
        finalConfig.proxyUrl = (fileConfig as any).proxyUrl || (fileConfig as any).publicUrl || process.env.ZS_AI_PROXY_URL || 'http://localhost:3100'
      } else {
        finalConfig.proxyUrl = process.env.ZS_AI_PROXY_URL || 'http://localhost:3100'
      }
    }
    
    // Validate required fields
    if (!finalConfig.apiKey) {
      throw new Error('apiKey is required')
    }
    
    if (!finalConfig.proxyUrl) {
      throw new Error('proxyUrl is required. Provide in config or set ZS_AI_PROXY_URL env var')
    }
    
    // Validate API key format
    this.validateApiKey(finalConfig.apiKey)
    
    // Extract userId from API key
    this.userId = this.extractUserId(finalConfig.apiKey)
    
    this.config = finalConfig
  }

  private validateApiKey(apiKey: string): void {
    if (!apiKey.startsWith('sk-zs-')) {
      throw new Error('Invalid API key format. Expected format: sk-zs-{userId}-{hash}')
    }
  }

  private extractUserId(apiKey: string): string {
    // Format: sk-zs-{userId}-{hash}
    const parts = apiKey.substring(6).split('-')
    if (parts.length < 2) {
      throw new Error('Invalid API key format')
    }
    return parts[0] // userId is the first part after sk-zs-
  }


  /**
   * Make chat completion request
   * Uses API key only - no username/password required
   */
  async chatCompletions(params: {
    provider: string
    model: string
    messages: Array<{ role: string; content: string }>
    ipAddress?: string
    context?: Record<string, any>
    [key: string]: any
  }): Promise<any> {
    // Make request to proxy server with API key only
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

  /**
   * Get userId extracted from API key
   */
  getUserId(): string {
    return this.userId
  }
}
