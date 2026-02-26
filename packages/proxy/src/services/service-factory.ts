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

type Mode = 'local' | 'live'

class ServiceFactory {
  private readonly mode: Mode
  private readonly authorizationService: IAuthorizationService
  private readonly policyStore: IPolicyStore
  private readonly entityStore: IEntityStore
  private readonly schemaStore: ISchemaStore

  constructor() {
    const config = loadConfig()
    this.mode = config.mode === 'live' ? 'live' : 'local'

    if (this.mode === 'local') {
      this.authorizationService = new LocalAuthorizationService()
      this.policyStore = localPolicyStore
      this.entityStore = localEntityStore
      this.schemaStore = localSchemaStore
    } else {
      this.authorizationService = liveAuthorizationService
      this.policyStore = livePolicyStore
      this.entityStore = liveEntityStore
      this.schemaStore = liveSchemaStore
    }

    console.log(`services: ${this.mode} mode`)
  }

  initialize(): void {
    // kept for backward compatibility with older startup paths
  }

  getAuthorizationService(): IAuthorizationService {
    return this.authorizationService
  }

  getPolicyStore(): IPolicyStore {
    return this.policyStore
  }

  getEntityStore(): IEntityStore {
    return this.entityStore
  }

  getSchemaStore(): ISchemaStore {
    return this.schemaStore
  }

  getMode(): Mode {
    return this.mode
  }
}

export const serviceFactory = new ServiceFactory()
