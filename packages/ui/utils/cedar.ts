import type { CedarDecimal, CedarIp } from '~/types/entity'

export function parseDecimal(value: CedarDecimal | undefined): number {
    if (!value || !value.__extn || value.__extn.fn !== 'decimal') {
        return 0
    }
    return parseFloat(value.__extn.arg) || 0
}

export function toDecimal(value: number, decimalPlaces: number = 4): CedarDecimal {
 
    const multiplier = Math.pow(10, decimalPlaces)
    const rounded = Math.round(value * multiplier) / multiplier
    
 
 
    const formatted = rounded.toFixed(decimalPlaces)
    
    return {
        __extn: {
            fn: 'decimal',
            arg: formatted
        }
    }
}

 
export function toDecimalOne(value: number): CedarDecimal {
    return toDecimal(value, 1)
}

 
export function toDecimalFour(value: number): CedarDecimal {
    return toDecimal(value, 4)
}

 
export function normalizeDecimal(value: CedarDecimal | undefined, decimalPlaces: number = 4): CedarDecimal {
    if (!value || !value.__extn || value.__extn.fn !== 'decimal') {
        return toDecimal(0, decimalPlaces)
    }
    
    const arg = value.__extn.arg
 
    if (!arg.includes('.')) {
        return toDecimal(parseFloat(arg) || 0, decimalPlaces)
    }
    
 
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
