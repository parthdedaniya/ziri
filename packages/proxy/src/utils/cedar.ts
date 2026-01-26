 

import type { Entity, CedarIp } from '../types/entity.js'

export function toDecimal(value: number, decimalPlaces: number = 4): Entity['attrs']['daily_spend_limit'] {
 
  const multiplier = Math.pow(10, decimalPlaces)
  const rounded = Math.round(value * multiplier) / multiplier
  
 
 
  const formatted = rounded.toFixed(decimalPlaces)
  
  return {
    __extn: {
      fn: 'decimal' as const,
      arg: formatted
    }
  }
}

export function toDecimalOne(value: number): Entity['attrs']['years_of_service'] {
  return toDecimal(value, 1) as Entity['attrs']['years_of_service']
}

export function toDecimalFour(value: number): Entity['attrs']['daily_spend_limit'] {
  return toDecimal(value, 4)
}

export function normalizeDecimal(value: any, decimalPlaces: number = 4): Entity['attrs']['daily_spend_limit'] {
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

export function toIp(value: string): CedarIp {
  return {
    __extn: {
      fn: 'ip' as const,
      arg: value
    }
  }
}
