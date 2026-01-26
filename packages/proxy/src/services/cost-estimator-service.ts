import { pricingService } from './pricing-service.js'

interface CostEstimate {
  estimatedInputTokens: number
  estimatedOutputTokens: number
  estimatedCost: number
  confidence: 'high' | 'medium' | 'low'
}

export class CostEstimatorService {
  private readonly CHARS_PER_TOKEN: Record<string, number> = {
    'gpt': 4,
    'claude': 3.5,
    'default': 4,
  }

  private readonly OUTPUT_RATIOS: Record<string, number> = {
    'gpt-4': 1.5,
    'gpt-4o': 1.5,
    'gpt-4o-mini': 1.5,
    'gpt-3.5-turbo': 1.0,
    'claude-3-opus': 2.0,
    'claude-3-sonnet': 1.5,
    'claude-3-haiku': 1.0,
    'default': 1.0,
  }

  private readonly SAFETY_BUFFER = 1.3 // 30% buffer

  async estimateCost(
    provider: string,
    model: string,
    messages: Array<{ role: string; content: string | any }>,
    maxTokens?: number
  ): Promise<CostEstimate> {
    const totalChars = this.countMessageCharacters(messages)
    const charsPerToken = this.getCharsPerToken(provider)
    const estimatedInputTokens = Math.ceil(totalChars / charsPerToken)

    let estimatedOutputTokens: number
    
    if (maxTokens) {
      estimatedOutputTokens = maxTokens
    } else {
      const outputRatio = this.getOutputRatio(model)
      estimatedOutputTokens = Math.ceil(estimatedInputTokens * outputRatio)
      estimatedOutputTokens = Math.min(estimatedOutputTokens, 4096)
    }

    const costResult = await pricingService.calculateCost(
      provider,
      model,
      estimatedInputTokens,
      estimatedOutputTokens,
      0
    )

    const estimatedCost = costResult.totalCost * this.SAFETY_BUFFER
    const confidence = this.determineConfidence(maxTokens, estimatedInputTokens)

    return {
      estimatedInputTokens,
      estimatedOutputTokens,
      estimatedCost,
      confidence,
    }
  }

   
  private countMessageCharacters(
    messages: Array<{ role: string; content: string | any }>
  ): number {
    let totalChars = 0

    for (const message of messages) {
      totalChars += 16

      if (typeof message.content === 'string') {
        totalChars += message.content.length
      } else if (Array.isArray(message.content)) {
        for (const part of message.content) {
          if (part.type === 'text') {
            totalChars += part.text?.length || 0
          } else if (part.type === 'image_url') {
            totalChars += 4000
          }
        }
      } else if (message.content && typeof message.content === 'object') {
        totalChars += JSON.stringify(message.content).length
      }
    }

    return totalChars
  }

  private getCharsPerToken(provider: string): number {
    const key = provider.toLowerCase()
    if (key.includes('openai') || key.includes('gpt')) {
      return this.CHARS_PER_TOKEN['gpt']
    }
    if (key.includes('anthropic') || key.includes('claude')) {
      return this.CHARS_PER_TOKEN['claude']
    }
    return this.CHARS_PER_TOKEN['default']
  }

  private getOutputRatio(model: string): number {
    const modelLower = model.toLowerCase()
    
    for (const [key, ratio] of Object.entries(this.OUTPUT_RATIOS)) {
      if (modelLower.includes(key)) {
        return ratio
      }
    }
    
    return this.OUTPUT_RATIOS['default']
  }

  private determineConfidence(
    maxTokens: number | undefined,
    inputTokens: number
  ): 'high' | 'medium' | 'low' {
    if (maxTokens) {
      return 'high'
    }
    if (inputTokens < 1000) {
      return 'medium'
    }
    return 'low'
  }
}

export const costEstimatorService = new CostEstimatorService()
