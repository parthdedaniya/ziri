import { useAdminAuth } from './useAdminAuth'
import { useToast } from './useToast'
import { useApiError } from './useApiError'

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface GeneratePolicyRequest {
  provider: string
  model: string
  messages: ChatMessage[]
  cedarSchema?: string
}

export interface GeneratePolicyResponse {
  policy: string
  usage?: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

export function useAIPolicyGeneration() {
  const { getAuthHeader } = useAdminAuth()
  const toast = useToast()
  const { getUserMessage } = useApiError()

  const generatePolicy = async (request: GeneratePolicyRequest): Promise<GeneratePolicyResponse> => {
    try {
      const authHeader = getAuthHeader()
      if (!authHeader) {
        throw new Error('Please login first')
      }

      const response = await fetch('/api/ai-policy/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        },
        body: JSON.stringify(request)
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }))
        throw new Error(errorData.error || `Failed to generate policy: ${response.statusText}`)
      }

      const data: GeneratePolicyResponse = await response.json()
      return data
    } catch (e: any) {
      toast.error(getUserMessage(e))
      throw e
    }
  }

  return {
    generatePolicy
  }
}
