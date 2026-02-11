import { ERROR_MESSAGES } from '~/config/error-messages'

type AnyError = {
  message?: string
  data?: {
    error?: string
    message?: string
    code?: string
  }
  response?: {
    data?: {
      error?: string
      message?: string
      code?: string
    }
  }
}

export function useApiError() {
  const getBody = (err: unknown) => {
    const error = err as AnyError
    return error?.data ?? error?.response?.data ?? {}
  }

  const getCode = (err: unknown): string | null => {
    const body = getBody(err)
    return typeof body.code === 'string' ? body.code : null
  }

  const getUserMessage = (err: unknown): string => {
    const body = getBody(err)
    const apiError = body.error ?? body.message
    const code = getCode(err)

    if (code && ERROR_MESSAGES[code]) {
      return ERROR_MESSAGES[code]
    }
    if (typeof apiError === 'string' && apiError.trim().length > 0) {
      return apiError
    }

    const fallbackMessage = (err as AnyError)?.message
    if (typeof fallbackMessage === 'string' && fallbackMessage.trim().length > 0) {
      return fallbackMessage
    }

    return 'Something went wrong. Please try again.'
  }

  return { getUserMessage, getCode }
}
