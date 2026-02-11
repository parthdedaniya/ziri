export function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

/**
 * Validates email or Mailgun-style From address.
 * Accepts: "abc@mail.com" or "Display Name <abc@mail.com>"
 */
export function validateEmailOrFromAddress(value: string): boolean {
    const trimmed = value.trim()
    if (!trimmed) return false
    // Format: "Display Name" <email@domain.com>
    const angleMatch = trimmed.match(/<([^>]+)>$/)
    if (angleMatch) {
        return validateEmail(angleMatch[1].trim())
    }
    return validateEmail(trimmed)
}

export function validateRequired(value: string): boolean {
    return value.trim().length > 0
}

export function validateUserId(userId: string): boolean {
    const userIdRegex = /^[a-zA-Z0-9_-]+$/
    return userIdRegex.test(userId)
}

export function validatePositiveNumber(value: number): boolean {
    return value >= 0
}

export function validateUrl(url: string): boolean {
    try {
        new URL(url)
        return true
    } catch {
        return false
    }
}
