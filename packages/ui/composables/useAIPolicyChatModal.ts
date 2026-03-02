import { nextTick } from 'vue'
import { useAIPolicyGeneration, type ChatMessage } from '~/composables/useAIPolicyGeneration'
import { useProviders } from '~/composables/useProviders'
import { useSchema } from '~/composables/useSchema'
import { useToast } from '~/composables/useToast'
import { useApiError } from '~/composables/useApiError'

export interface ExtendedChatMessage extends ChatMessage {
  timestamp?: Date
}

interface AIPolicyChatModalProps {
  modelValue: boolean
}

interface AIPolicyChatModalEmit {
  (event: 'update:modelValue', value: boolean): void
  (event: 'usePolicy', policy: string): void
}

export function useAIPolicyChatModal(
  props: AIPolicyChatModalProps,
  emit: AIPolicyChatModalEmit
) {
  const { generatePolicy } = useAIPolicyGeneration()
  const { providers, listProviders: loadProviders } = useProviders()
  const { getSchema } = useSchema()
  const toast = useToast()
  const { getUserMessage } = useApiError()

  const selectedModel = ref<string>('')
  const messages = ref<ExtendedChatMessage[]>([])
  const currentMessage = ref('')
  const isLoading = ref(false)
  const generatedPolicy = ref<string>('')
  const schemaText = ref<string>('')
  const messagesContainer = ref<HTMLElement>()

  const availableModels = computed(() => {
    const models: Array<{ value: string; label: string; provider: string; displayName: string }> = []
    for (const provider of providers.value) {
      if (!provider.hasCredentials || !provider.models?.length) continue
      for (const modelId of provider.models) {
        models.push({
          value: `${provider.name}:${modelId}`,
          label: modelId,
          provider: provider.name,
          displayName: provider.displayName
        })
      }
    }
    return models
  })

  const providersWithModels = computed(() => {
    const seen = new Set<string>()
    return availableModels.value
      .map(m => ({ name: m.provider, displayName: m.displayName }))
      .filter(p => {
        if (seen.has(p.name)) return false
        seen.add(p.name)
        return true
      })
  })

  const isOpen = computed({
    get: () => props.modelValue,
    set: value => emit('update:modelValue', value)
  })

  const resetChat = () => {
    messages.value = []
    currentMessage.value = ''
    generatedPolicy.value = ''
  }

  watch(availableModels, models => {
    if (models.length > 0 && !selectedModel.value) {
      selectedModel.value = models[0].value
    }
  }, { immediate: true })

  watch(isOpen, open => {
    if (!open) {
      resetChat()
    }
  })

  const scrollToBottom = () => {
    nextTick(() => {
      if (messagesContainer.value) {
        messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
      }
    })
  }

  watch([messages, isLoading], scrollToBottom)

  onMounted(async () => {
    try {
      const schemaData = await getSchema('cedar')
      schemaText.value = schemaData.schemaCedarText || JSON.stringify(schemaData.schema, null, 2)
    } catch {
    }

    try {
      await loadProviders()
    } catch {
    }
  })

  const sendMessage = async () => {
    if (!currentMessage.value.trim() || !selectedModel.value) {
      return
    }

    const colonIdx = selectedModel.value.indexOf(':')
    const provider = colonIdx > 0 ? selectedModel.value.slice(0, colonIdx) : ''
    const model = colonIdx > 0 ? selectedModel.value.slice(colonIdx + 1) : selectedModel.value
    if (!provider || !model) return

    messages.value.push({
      role: 'user',
      content: currentMessage.value.trim(),
      timestamp: new Date()
    })
    currentMessage.value = ''
    isLoading.value = true

    try {
      const response = await generatePolicy({
        provider,
        model,
        messages: messages.value.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
        cedarSchema: schemaText.value
      })

      messages.value.push({
        role: 'assistant',
        content: response.policy,
        timestamp: new Date()
      })
      generatedPolicy.value = response.policy
    } catch (e: any) {
      toast.error(getUserMessage(e))
    } finally {
      isLoading.value = false
    }
  }

  const handleUsePolicy = (policyText?: string) => {
    const policy = policyText || generatedPolicy.value
    if (policy) {
      const url = `/rules?create=true&policy=${encodeURIComponent(policy)}`
      window.open(url, '_blank')
    }
  }

  const copyPolicy = async (policyText?: string) => {
    const textToCopy = policyText || generatedPolicy.value
    if (!textToCopy) return
    try {
      await navigator.clipboard.writeText(textToCopy)
      toast.success('Policy copied to clipboard')
    } catch {
      toast.error('Failed to copy policy')
    }
  }

  const handleKeyPress = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return {
    selectedModel,
    messages,
    currentMessage,
    isLoading,
    availableModels,
    providersWithModels,
    isOpen,
    sendMessage,
    handleUsePolicy,
    copyPolicy,
    handleKeyPress,
    messagesContainer
  }
}
