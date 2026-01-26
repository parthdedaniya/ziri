 

import type { IAuthorizationService, IPolicyStore, IEntityStore, ISchemaStore } from './interfaces.js'
import { LocalAuthorizationService } from './local/local-authorization-service.js'
import { localPolicyStore } from './local/local-policy-store.js'
import { localEntityStore } from './local/local-entity-store.js'
import { localSchemaStore } from './local/local-schema-store.js'
import { liveAuthorizationService } from './live/live-authorization-service.js'
import { livePolicyStore } from './live/live-policy-store.js'
import { liveEntityStore } from './live/live-entity-store.js'
import { liveSchemaStore } from './live/live-schema-store.js'
import { loadConfig } from '../config.js'

 
class ServiceFactory {
  private _authorizationService: IAuthorizationService | null = null
  private _policyStore: IPolicyStore | null = null
  private _entityStore: IEntityStore | null = null
  private _schemaStore: ISchemaStore | null = null
  private _mode: 'local' | 'live' | null = null
  
   
  initialize(): void {
    const config = loadConfig()
    const mode = config.mode || 'local' // Default to local
    
    if (this._mode === mode && this._authorizationService) {
 
      return
    }
    
    this._mode = mode
    
    if (mode === 'local') {
 
      this._authorizationService = new LocalAuthorizationService()
      this._policyStore = localPolicyStore
      this._entityStore = localEntityStore
      this._schemaStore = localSchemaStore
    } else {
 
      this._authorizationService = liveAuthorizationService
      this._policyStore = livePolicyStore
      this._entityStore = liveEntityStore
      this._schemaStore = liveSchemaStore
    }
    
    console.log(`[SERVICE FACTORY] Initialized in ${mode} mode`)
  }
  
   
  getAuthorizationService(): IAuthorizationService {
    if (!this._authorizationService) {
      this.initialize()
    }
    return this._authorizationService!
  }
  
   
  getPolicyStore(): IPolicyStore {
    if (!this._policyStore) {
      this.initialize()
    }
    return this._policyStore!
  }
  
   
  getEntityStore(): IEntityStore {
    if (!this._entityStore) {
      this.initialize()
    }
    return this._entityStore!
  }
  
   
  getSchemaStore(): ISchemaStore {
    if (!this._schemaStore) {
      this.initialize()
    }
    return this._schemaStore!
  }
  
   
  getMode(): 'local' | 'live' {
    if (!this._mode) {
      this.initialize()
    }
    return this._mode!
  }
}

 
export const serviceFactory = new ServiceFactory()
