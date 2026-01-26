 

export interface CedarDecimal {
  __extn: {
    fn: 'decimal'
    arg: string
  }
}

export interface CedarIp {
  __extn: {
    fn: 'ip'
    arg: string
  }
}

export interface EntityUid {
  type: string
  id: string
}

 
 
export interface EntityAttrs {
 
  user_id?: string
  name?: string
  email?: string
  department?: string
  is_agent?: boolean
  limit_requests_per_minute?: number
  
 
  current_daily_spend?: CedarDecimal
  current_monthly_spend?: CedarDecimal
  last_daily_reset?: string
  last_monthly_reset?: string
  status?: 'active' | 'revoked' | 'disabled'
  user?: {
    __entity: {
      type: string
      id: string
    }
  }
  
 
  role?: string
  security_clearance?: number
  training_completed?: boolean
  years_of_service?: CedarDecimal
  daily_spend_limit?: CedarDecimal
  monthly_spend_limit?: CedarDecimal
  allowed_ip_ranges?: CedarIp[]
  created_at?: string
  team?: string
  
 
  [key: string]: any
}

export interface Entity {
  uid: EntityUid
  attrs: EntityAttrs
  parents: EntityUid[]
}
