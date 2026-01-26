export interface GatewayConfig {
 
    mode?: 'local' | 'live'  // Default: 'local'
    
 
    server?: {
        host?: string  // Default: '127.0.0.1'
        port?: number  // Default: 3100
    }
    publicUrl?: string  // Public URL for sharing (ngrok, Tailscale, etc.)
    
 
    email?: {
        enabled?: boolean
        provider?: 'smtp' | 'sendgrid' | 'manual'
        smtp?: {
            host: string
            port: number
            secure?: boolean
            auth: {
                user: string
                pass: string
            }
        }
        sendgrid?: {
            apiKey: string
        }
        from?: string
    }
    
 
    projectId?: string
    orgId?: string
    clientId?: string
    clientSecret?: string
    pdpUrl?: string
    proxyUrl?: string  // Deprecated: use server.port instead
    port?: number  // Deprecated: use server.port instead
    logLevel?: 'debug' | 'info' | 'warn' | 'error'
    masterKey?: string  // Read-only: Display only, not editable
}

export const defaultConfig: GatewayConfig = {
    mode: 'local',
    server: {
        host: '127.0.0.1',
        port: 3100
    },
    publicUrl: '',
    email: {
        enabled: false,
        provider: 'manual'
    },
    proxyUrl: '',
    port: 3100,
    logLevel: 'info',
    masterKey: ''
}
