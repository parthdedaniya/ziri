// Cedar utility functions for formatting values

import type { Entity, CedarIp } from '../types/entity.js'

/**
 * Convert number to Cedar decimal format
 * @param value - Number to convert
 * @param decimalPlaces - Number of decimal places (default: 4)
 */
export function toDecimal(value: number, decimalPlaces: number = 4): Entity['attrs']['daily_spend_limit'] {
  // Round to specified decimal places
  const multiplier = Math.pow(10, decimalPlaces)
  const rounded = Math.round(value * multiplier) / multiplier
  
  // Format with specified decimal places
  // Cedar requires decimal values to always have a decimal point (e.g., "500.0" not "500")
  const formatted = rounded.toFixed(decimalPlaces)
  
  return {
    __extn: {
      fn: 'decimal' as const,
      arg: formatted
    }
  }
}

/**
 * Convert to decimal with 1 decimal place (for years of service)
 */
export function toDecimalOne(value: number): Entity['attrs']['years_of_service'] {
  return toDecimal(value, 1) as Entity['attrs']['years_of_service']
}

/**
 * Convert to decimal with 4 decimal places (for spend limits)
 */
export function toDecimalFour(value: number): Entity['attrs']['daily_spend_limit'] {
  return toDecimal(value, 4)
}

/**
 * Normalize an existing CedarDecimal to ensure it has a decimal point
 * Useful when preserving existing decimal values that might be in old format
 */
export function normalizeDecimal(value: any, decimalPlaces: number = 4): Entity['attrs']['daily_spend_limit'] {
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

/**
 * Convert IP address string to Cedar IP format
 */
export function toIp(value: string): CedarIp {
  return {
    __extn: {
      fn: 'ip' as const,
      arg: value
    }
  }
}
