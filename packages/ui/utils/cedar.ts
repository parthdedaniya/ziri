import type { CedarDecimal, CedarIp } from '~/types/entity'

export function parseDecimal(value: CedarDecimal | undefined): number {
    if (!value || !value.__extn || value.__extn.fn !== 'decimal') {
        return 0
    }
    return parseFloat(value.__extn.arg) || 0
}

export function toDecimal(value: number, decimalPlaces: number = 4): CedarDecimal {
    // Round to specified decimal places (default 4 for spend limits)
    const multiplier = Math.pow(10, decimalPlaces)
    const rounded = Math.round(value * multiplier) / multiplier
    
    // Format with specified decimal places
    // Cedar requires decimal values to always have a decimal point (e.g., "500.0" not "500")
    const formatted = rounded.toFixed(decimalPlaces)
    
    return {
        __extn: {
            fn: 'decimal',
            arg: formatted
        }
    }
}

/**
 * Convert to decimal with 1 decimal place (for years of service)
 */
export function toDecimalOne(value: number): CedarDecimal {
    return toDecimal(value, 1)
}

/**
 * Convert to decimal with 4 decimal places (for spend limits)
 */
export function toDecimalFour(value: number): CedarDecimal {
    return toDecimal(value, 4)
}

/**
 * Normalize an existing CedarDecimal to ensure it has a decimal point
 * Useful when preserving existing decimal values that might be in old format
 */
export function normalizeDecimal(value: CedarDecimal | undefined, decimalPlaces: number = 4): CedarDecimal {
    if (!value || !value.__extn || value.__extn.fn !== 'decimal') {
        return toDecimal(0, decimalPlaces)
    }
    
    const arg = value.__extn.arg
    // If the value doesn't contain a decimal point, add one
    if (!arg.includes('.')) {
        return toDecimal(parseFloat(arg) || 0, decimalPlaces)
    }
    
    // If it already has a decimal point, ensure it has the right number of decimal places
    const numValue = parseFloat(arg) || 0
    return toDecimal(numValue, decimalPlaces)
}

export function parseIp(value: CedarIp | undefined): string {
    if (!value || !value.__extn || value.__extn.fn !== 'ip') {
        return ''
    }
    return value.__extn.arg
}

export function toIp(value: string): CedarIp {
    return {
        __extn: {
            fn: 'ip',
            arg: value
        }
    }
}

export function extractPolicyEffect(policy: string): 'permit' | 'forbid' {
    const trimmed = policy.trim().toLowerCase()
    if (trimmed.startsWith('permit')) return 'permit'
    if (trimmed.startsWith('forbid')) return 'forbid'
    return 'permit'
}

export function formatSchemaForDisplay(schema: any): string {
    return JSON.stringify(schema, null, 2)
}
