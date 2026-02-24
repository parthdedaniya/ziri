export function validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
}

export function validateEmailOrFromAddress(value: string): boolean {
    const trimmed = value.trim()
    if (!trimmed) return false

    const angleMatch = trimmed.match(/<([^>]+)>$/)
    if (angleMatch) {
        return validateEmail(angleMatch[1].trim())
    }
    return validateEmail(trimmed)
}

export function getFromAddressValidationHint(value: string): string | null {
    const trimmed = value.trim()
    if (!trimmed) return null
    const angleMatch = trimmed.match(/<([^>]+)>$/)
    const toCheck = angleMatch ? angleMatch[1].trim() : trimmed
    if (!toCheck.includes('@')) {
        return 'Use a full email address (e.g. postmaster@your-domain.mailgun.org), not just the domain.'
    }
    return null
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
