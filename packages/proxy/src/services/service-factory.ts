// Service factory - creates appropriate implementations based on mode

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

/**
 * Service factory - provides singleton access to services based on mode
 */
class ServiceFactory {
  private _authorizationService: IAuthorizationService | null = null
  private _policyStore: IPolicyStore | null = null
  private _entityStore: IEntityStore | null = null
  private _schemaStore: ISchemaStore | null = null
  private _mode: 'local' | 'live' | null = null
  
  /**
   * Initialize services based on config mode
   */
  initialize(): void {
    const config = loadConfig()
    const mode = config.mode || 'local' // Default to local
    
    if (this._mode === mode && this._authorizationService) {
      // Already initialized with correct mode
      return
    }
    
    this._mode = mode
    
    if (mode === 'local') {
      // Local implementations
      this._authorizationService = new LocalAuthorizationService()
      this._policyStore = localPolicyStore
      this._entityStore = localEntityStore
      this._schemaStore = localSchemaStore
    } else {
      // Live implementations
      this._authorizationService = liveAuthorizationService
      this._policyStore = livePolicyStore
      this._entityStore = liveEntityStore
      this._schemaStore = liveSchemaStore
    }
    
    console.log(`[SERVICE FACTORY] Initialized in ${mode} mode`)
  }
  
  /**
   * Get authorization service
   */
  getAuthorizationService(): IAuthorizationService {
    if (!this._authorizationService) {
      this.initialize()
    }
    return this._authorizationService!
  }
  
  /**
   * Get policy store
   */
  getPolicyStore(): IPolicyStore {
    if (!this._policyStore) {
      this.initialize()
    }
    return this._policyStore!
  }
  
  /**
   * Get entity store
   */
  getEntityStore(): IEntityStore {
    if (!this._entityStore) {
      this.initialize()
    }
    return this._entityStore!
  }
  
  /**
   * Get schema store
   */
  getSchemaStore(): ISchemaStore {
    if (!this._schemaStore) {
      this.initialize()
    }
    return this._schemaStore!
  }
  
  /**
   * Get current mode
   */
  getMode(): 'local' | 'live' {
    if (!this._mode) {
      this.initialize()
    }
    return this._mode!
  }
}

// Export singleton instance
export const serviceFactory = new ServiceFactory()
