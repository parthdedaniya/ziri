 
 
 

 
 
let cedar: any = null
let cedarLoadingPromise: Promise<any> | null = null

 
async function loadCedar(): Promise<any> {
 
  if (process.server) {
    throw new Error('Cedar WASM can only be used on the client side')
  }
  
  if (cedar) {
    return cedar
  }
  
  if (!cedarLoadingPromise) {
 
    cedarLoadingPromise = import('@cedar-policy/cedar-wasm').catch((error) => {
      console.error('[CEDAR WASM] Failed to load module:', error)
      throw new Error('Failed to load Cedar WASM module. Make sure you are running on the client side.')
    })
  }
  
  cedar = await cedarLoadingPromise
  return cedar
}

export interface ValidationError {
  message: string
  help?: string | null
  sourceLocations?: Array<{
    start: number
    end: number
  }>
}

export interface SchemaValidationResult {
  valid: boolean
  errors: ValidationError[]
}

export interface PolicyValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationError[]
}

export interface EntityValidationResult {
  valid: boolean
  errors: ValidationError[]
}

 
export function useCedarWasm() {
   
  const schemaToJson = async (cedarText: string): Promise<{ json: any } | { errors: ValidationError[] }> => {
 
    if (process.server) {
      return {
        errors: [{
          message: 'Cedar WASM operations are only available on the client side',
          help: null,
          sourceLocations: []
        }]
      }
    }
    
    try {
      const cedarModule = await loadCedar()
      const result = cedarModule.schemaToJson(cedarText)
      
      if (result.type === 'success') {
        return { json: result.json }
      } else {
        return {
          errors: result.errors.map((e: any) => ({
            message: e.message || JSON.stringify(e),
            help: e.help || null,
            sourceLocations: e.sourceLocations || []
          }))
        }
      }
    } catch (error: any) {
      return {
        errors: [{
          message: error.message || 'Failed to convert schema',
          help: null,
          sourceLocations: []
        }]
      }
    }
  }

   
  const schemaToText = async (jsonSchema: any): Promise<{ text: string } | { errors: ValidationError[] }> => {
 
    if (process.server) {
      return {
        errors: [{
          message: 'Cedar WASM operations are only available on the client side',
          help: null,
          sourceLocations: []
        }]
      }
    }
    
    try {
      const cedarModule = await loadCedar()
      const result = cedarModule.schemaToText(jsonSchema)
      
      if (result.type === 'success') {
        return { text: result.text }
      } else {
        return {
          errors: result.errors.map((e: any) => ({
            message: e.message || JSON.stringify(e),
            help: e.help || null,
            sourceLocations: e.sourceLocations || []
          }))
        }
      }
    } catch (error: any) {
      return {
        errors: [{
          message: error.message || 'Failed to convert schema',
          help: null,
          sourceLocations: []
        }]
      }
    }
  }

   
  const validateCedarSchema = async (cedarText: string): Promise<SchemaValidationResult> => {
 
    if (process.server) {
      return {
        valid: false,
        errors: [{
          message: 'Cedar WASM operations are only available on the client side',
          help: null,
          sourceLocations: []
        }]
      }
    }
    
    try {
      const cedarModule = await loadCedar()
      const result = cedarModule.checkParseSchema(cedarText)
      
      if (result.type === 'success') {
        return { valid: true, errors: [] }
      } else {
        return {
          valid: false,
          errors: result.errors.map((e: any) => ({
            message: e.message || JSON.stringify(e),
            help: e.help || null,
            sourceLocations: e.sourceLocations || []
          }))
        }
      }
    } catch (error: any) {
      return {
        valid: false,
        errors: [{
          message: error.message || 'Failed to validate schema',
          help: null,
          sourceLocations: []
        }]
      }
    }
  }

   
  const validateJsonSchema = async (jsonSchema: any): Promise<SchemaValidationResult> => {
 
    if (process.server) {
      return {
        valid: false,
        errors: [{
          message: 'Cedar WASM operations are only available on the client side',
          help: null,
          sourceLocations: []
        }]
      }
    }
    
    try {
      const cedarModule = await loadCedar()
      const result = cedarModule.checkParseSchema(jsonSchema)
      
      if (result.type === 'success') {
        return { valid: true, errors: [] }
      } else {
        return {
          valid: false,
          errors: result.errors.map((e: any) => ({
            message: e.message || JSON.stringify(e),
            help: e.help || null,
            sourceLocations: e.sourceLocations || []
          }))
        }
      }
    } catch (error: any) {
      return {
        valid: false,
        errors: [{
          message: error.message || 'Failed to validate schema',
          help: null,
          sourceLocations: []
        }]
      }
    }
  }

   
  const validatePolicies = async (
    policyText: string,
    schema: any
  ): Promise<PolicyValidationResult> => {
 
    if (process.server) {
      return {
        valid: false,
        errors: [{
          message: 'Cedar WASM operations are only available on the client side',
          help: null,
          sourceLocations: []
        }],
        warnings: []
      }
    }
    
    try {
      const cedarModule = await loadCedar()
      
 
      const schemaObj = typeof schema === 'string' ? JSON.parse(schema) : schema
      
      const result: any = cedarModule.validate({
        validationSettings: { mode: 'strict' },
        schema: schemaObj,
        policies: {
          staticPolicies: policyText,
          templates: {},
          templateLinks: []
        }
      })
      
      if (result.type === 'success') {
        const errors = (result.validationErrors || []).map((item: any) => ({
          message: item.error?.message || JSON.stringify(item.error),
          help: item.error?.help || null,
          sourceLocations: item.error?.sourceLocations || []
        }))
        
        const warnings = (result.validationWarnings || []).map((item: any) => ({
          message: item.error?.message || JSON.stringify(item.error),
          help: item.error?.help || null,
          sourceLocations: item.error?.sourceLocations || []
        }))
        
        return {
          valid: errors.length === 0,
          errors,
          warnings
        }
      } else {
        return {
          valid: false,
          errors: result.errors?.map((e: any) => ({
            message: e.message || JSON.stringify(e),
            help: e.help || null,
            sourceLocations: e.sourceLocations || []
          })) || [],
          warnings: []
        }
      }
    } catch (error: any) {
      return {
        valid: false,
        errors: [{
          message: error.message || 'Failed to validate policies',
          help: null,
          sourceLocations: []
        }],
        warnings: []
      }
    }
  }

   
  const validateEntities = async (entities: any[]): Promise<EntityValidationResult> => {
 
    if (process.server) {
      return {
        valid: false,
        errors: [{
          message: 'Cedar WASM operations are only available on the client side',
          help: null,
          sourceLocations: []
        }]
      }
    }
    
    try {
      const cedarModule = await loadCedar()
      const result = cedarModule.checkParseEntities({ entities })
      
      if (result.type === 'success') {
        return { valid: true, errors: [] }
      } else {
        return {
          valid: false,
          errors: result.errors.map((e: any) => ({
            message: e.message || JSON.stringify(e),
            help: e.help || null,
            sourceLocations: []
          }))
        }
      }
    } catch (error: any) {
      return {
        valid: false,
        errors: [{
          message: error.message || 'Failed to validate entities',
          help: null,
          sourceLocations: []
        }]
      }
    }
  }

   
  const formatPolicy = async (
    policyText: string,
    indentWidth: number = 4
  ): Promise<{ formatted: string } | { errors: ValidationError[] }> => {
 
    if (process.server) {
      return {
        errors: [{
          message: 'Cedar WASM operations are only available on the client side',
          help: null,
          sourceLocations: []
        }]
      }
    }
    
    try {
      const cedarModule = await loadCedar()
      const result = cedarModule.formatPolicies({
        indentWidth,
        policyText
      })
      
      if (result.type === 'success') {
        return { formatted: result.formatted_policy }
      } else {
        return {
          errors: result.errors.map((e: any) => ({
            message: e.message || JSON.stringify(e),
            help: e.help || null,
            sourceLocations: e.sourceLocations || []
          }))
        }
      }
    } catch (error: any) {
      return {
        errors: [{
          message: error.message || 'Failed to format policy',
          help: null,
          sourceLocations: []
        }]
      }
    }
  }

  return {
    loadCedar,
    schemaToJson,
    schemaToText,
    validateCedarSchema,
    validateJsonSchema,
    validatePolicies,
    validateEntities,
    formatPolicy
  }
}
