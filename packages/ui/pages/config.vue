<script setup lang="ts">
import { useConfigStore } from '~/stores/config'
import { useToast } from '~/composables/useToast'
import { useAdminAuth } from '~/composables/useAdminAuth'
import { validateEmail, validateEmailOrFromAddress } from '~/utils/validators'
import { useSchema } from '~/composables/useSchema'
import { useRules } from '~/composables/useRules'
import { useKeys } from '~/composables/useKeys'
import { useInternalAuth } from '~/composables/useInternalAuth'
import { useApiError } from '~/composables/useApiError'

const configStore = useConfigStore()
const toast = useToast()
const { getAuthHeader } = useAdminAuth()
const { getSchema } = useSchema()
const { listRules } = useRules()
const { listKeys } = useKeys()
const { checkAction } = useInternalAuth()
const { getUserMessage } = useApiError()

const isSaving = ref(false)
const permissionsLoading = ref(true)
const canUpdateConfig = ref(false)

 
const form = reactive({
  mode: 'local' as 'local' | 'live',
  server: {
    host: '127.0.0.1',
    port: 3100
  },
  publicUrl: '',
  email: {
    enabled: false,
    provider: 'manual' as 'smtp' | 'sendgrid' | 'mailgun' | 'ses' | 'manual',
    smtp: {
      host: '',
      port: 587,
      secure: false,
      auth: {
        user: '',
        pass: ''
      }
    },
    sendgrid: {
      apiKey: ''
    },
    mailgun: {
      apiKey: '',
      domain: '',
      apiUrl: ''
    },
    ses: {
      accessKeyId: '',
      secretAccessKey: '',
      region: 'us-east-1'
    },
    from: ''
  },
  logLevel: 'info' as 'debug' | 'info' | 'warn' | 'error'
})

onMounted(async () => {

  permissionsLoading.value = true
  try {
    const check = await checkAction('update_config', 'config')
    canUpdateConfig.value = check.allowed
  } finally {
    permissionsLoading.value = false
  }
 
  try {
    const authHeader = getAuthHeader()
    const headers: Record<string, string> = {}
    if (authHeader) headers['Authorization'] = authHeader

    const response = await fetch('/api/config', { headers })
    if (response.ok) {
      const config = await response.json()
      form.mode = config.mode || 'local'
      form.server = config.server || { host: '127.0.0.1', port: configStore.port || 3100 }
      form.publicUrl = config.publicUrl || ''
      const e = config.email || {}
      form.email = {
        enabled: e.enabled ?? false,
        provider: (e.provider || 'manual') as 'manual' | 'smtp' | 'sendgrid' | 'mailgun' | 'ses',
        smtp: { host: e.smtp?.host ?? '', port: e.smtp?.port ?? 587, secure: e.smtp?.secure ?? false, auth: { user: e.smtp?.auth?.user ?? '', pass: e.smtp?.auth?.pass ?? '' } },
        sendgrid: { apiKey: e.sendgrid?.apiKey ?? '' },
        mailgun: { apiKey: e.mailgun?.apiKey ?? '', domain: e.mailgun?.domain ?? '', apiUrl: e.mailgun?.apiUrl ?? '' },
        ses: { accessKeyId: e.ses?.accessKeyId ?? '', secretAccessKey: e.ses?.secretAccessKey ?? '', region: e.ses?.region ?? 'us-east-1' },
        from: e.from ?? ''
      }
      form.logLevel = config.logLevel || 'info'
    } else {
 
      form.mode = 'local'
      form.server = { host: configStore.server?.host ?? '127.0.0.1', port: configStore.server?.port ?? configStore.port ?? 3100 }
      form.publicUrl = configStore.publicUrl || ''
      const stored = configStore.email
      form.email = {
        enabled: stored?.enabled ?? false,
        provider: (stored?.provider || 'manual') as 'manual' | 'smtp' | 'sendgrid' | 'mailgun' | 'ses',
        smtp: { host: stored?.smtp?.host ?? '', port: stored?.smtp?.port ?? 587, secure: stored?.smtp?.secure ?? false, auth: { user: stored?.smtp?.auth?.user ?? '', pass: stored?.smtp?.auth?.pass ?? '' } },
        sendgrid: { apiKey: stored?.sendgrid?.apiKey ?? '' },
        mailgun: { apiKey: stored?.mailgun?.apiKey ?? '', domain: stored?.mailgun?.domain ?? '', apiUrl: stored?.mailgun?.apiUrl ?? '' },
        ses: { accessKeyId: stored?.ses?.accessKeyId ?? '', secretAccessKey: stored?.ses?.secretAccessKey ?? '', region: stored?.ses?.region ?? 'us-east-1' },
        from: stored?.from ?? ''
      }
      form.logLevel = configStore.logLevel || 'info'
    }
  } catch (e) {
 
    form.mode = 'local'
    form.server = { host: configStore.server?.host ?? '127.0.0.1', port: configStore.server?.port ?? configStore.port ?? 3100 }
    form.publicUrl = configStore.publicUrl || ''
    const stored = configStore.email
    form.email = {
      enabled: stored?.enabled ?? false,
      provider: (stored?.provider || 'manual') as 'manual' | 'smtp' | 'sendgrid' | 'mailgun' | 'ses',
      smtp: { host: stored?.smtp?.host ?? '', port: stored?.smtp?.port ?? 587, secure: stored?.smtp?.secure ?? false, auth: { user: stored?.smtp?.auth?.user ?? '', pass: stored?.smtp?.auth?.pass ?? '' } },
      sendgrid: { apiKey: stored?.sendgrid?.apiKey ?? '' },
      mailgun: { apiKey: stored?.mailgun?.apiKey ?? '', domain: stored?.mailgun?.domain ?? '', apiUrl: stored?.mailgun?.apiUrl ?? '' },
      ses: { accessKeyId: stored?.ses?.accessKeyId ?? '', secretAccessKey: stored?.ses?.secretAccessKey ?? '', region: stored?.ses?.region ?? 'us-east-1' },
      from: stored?.from ?? ''
    }
    form.logLevel = configStore.logLevel || 'info'
  }
})

function validateEmailConfig(): string | null {
  if (!form.email.enabled) return null
  const { provider, smtp, sendgrid, mailgun, ses, from } = form.email

  if (provider === 'smtp') {
    if (!smtp.host?.trim()) return 'SMTP Host is required'
    if (!smtp.port || smtp.port < 1 || smtp.port > 65535) return 'Valid SMTP Port is required'
    if (!smtp.auth.user?.trim()) return 'SMTP Username is required'
    if (!smtp.auth.pass?.trim()) return 'SMTP Password is required'
  }

  if (provider === 'sendgrid') {
    if (!sendgrid.apiKey?.trim()) return 'SendGrid API Key is required'
    if (!from?.trim()) return 'From Address is required for SendGrid'
    if (!validateEmail(from)) return 'Valid From Address is required'
  }

  if (provider === 'mailgun') {
    if (!mailgun.apiKey?.trim()) return 'Mailgun API Key is required'
    if (!mailgun.domain?.trim()) return 'Mailgun Sending Domain is required'
    if (!from?.trim()) return 'From Address is required for Mailgun'
    if (!validateEmailOrFromAddress(from)) return 'Valid From Address is required (e.g. noreply@example.com or "Name" <noreply@example.com>)'
  }

  if (provider === 'ses') {
    if (!ses.accessKeyId?.trim()) return 'AWS Access Key ID is required'
    if (!ses.secretAccessKey?.trim()) return 'AWS Secret Access Key is required'
    if (!ses.region?.trim()) return 'AWS Region is required'

    if (!from?.trim()) return 'From Address is required for AWS SES (must be verified in SES)'
    if (!validateEmailOrFromAddress(from)) return 'Valid From Address is required (e.g. noreply@example.com or "Name" <noreply@example.com>)'
  }

  return null
}

const saveConfig = async () => {

  const check = await checkAction('update_config', 'config')
  if (!check.allowed) {
    toast.error('You do not have permission to update configuration')
    return
  }

  const emailError = validateEmailConfig()
  if (emailError) {
    toast.error(emailError)
    return
  }
  
  isSaving.value = true
  try {
    await configStore.updateConfig(form)
    await nextTick()
    await new Promise(resolve => setTimeout(resolve, 100))
    
    toast.success('Configuration saved successfully')
    toast.info('Restart the proxy server for server settings to take effect')
  } catch (e: any) {
    toast.error(getUserMessage(e))
  } finally {
    isSaving.value = false
  }
}

const resetToDefaults = async () => {
  form.mode = 'local'
  form.server = { host: '127.0.0.1', port: 3100 }
  form.publicUrl = ''
  form.email = {
    enabled: false,
    provider: 'manual',
    smtp: { host: '', port: 587, secure: false, auth: { user: '', pass: '' } },
    sendgrid: { apiKey: '' },
    mailgun: { apiKey: '', domain: '', apiUrl: '' },
    ses: { accessKeyId: '', secretAccessKey: '', region: 'us-east-1' },
    from: ''
  }
  form.logLevel = 'info'
  await configStore.updateConfig(form)
  toast.info('Configuration reset to defaults')
}
</script>

<template>
  <div class="max-w-4xl space-y-6">
    <!-- Permissions Loading Skeleton -->
    <div v-if="permissionsLoading" class="max-w-2xl space-y-6">
      <!-- Header Skeleton -->
      <div class="skeleton-shimmer h-8 w-48 rounded-lg"></div>
      
      <!-- Server Settings Card Skeleton -->
      <section class="card">
        <div class="flex items-center gap-3 mb-5">
          <div class="skeleton-shimmer h-10 w-10 rounded-lg"></div>
          <div class="skeleton-shimmer h-5 w-32 rounded"></div>
        </div>
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <div class="skeleton-shimmer h-4 w-16 rounded"></div>
              <div class="skeleton-shimmer h-10 w-full rounded-lg"></div>
              <div class="skeleton-shimmer h-3 w-48 rounded"></div>
            </div>
            <div class="space-y-2">
              <div class="skeleton-shimmer h-4 w-16 rounded"></div>
              <div class="skeleton-shimmer h-10 w-full rounded-lg"></div>
              <div class="skeleton-shimmer h-3 w-40 rounded"></div>
            </div>
          </div>
          <div class="space-y-2">
            <div class="skeleton-shimmer h-4 w-24 rounded"></div>
            <div class="skeleton-shimmer h-10 w-full rounded-lg"></div>
            <div class="skeleton-shimmer h-3 w-64 rounded"></div>
          </div>
          <div class="space-y-2">
            <div class="skeleton-shimmer h-4 w-20 rounded"></div>
            <div class="skeleton-shimmer h-10 w-full rounded-lg"></div>
          </div>
        </div>
      </section>
      
      <!-- Email Settings Card Skeleton -->
      <section class="card">
        <div class="flex items-center gap-3 mb-5">
          <div class="skeleton-shimmer h-10 w-10 rounded-lg"></div>
          <div class="skeleton-shimmer h-5 w-32 rounded"></div>
        </div>
        <div class="space-y-4">
          <div class="flex items-center gap-2">
            <div class="skeleton-shimmer h-5 w-5 rounded"></div>
            <div class="skeleton-shimmer h-5 w-32 rounded"></div>
          </div>
          <div class="space-y-2">
            <div class="skeleton-shimmer h-4 w-24 rounded"></div>
            <div class="skeleton-shimmer h-10 w-full rounded-lg"></div>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <div class="space-y-2">
              <div class="skeleton-shimmer h-4 w-20 rounded"></div>
              <div class="skeleton-shimmer h-10 w-full rounded-lg"></div>
            </div>
            <div class="space-y-2">
              <div class="skeleton-shimmer h-4 w-20 rounded"></div>
              <div class="skeleton-shimmer h-10 w-full rounded-lg"></div>
            </div>
          </div>
        </div>
      </section>
      
      <!-- Actions Skeleton -->
      <div class="flex gap-3">
        <div class="skeleton-shimmer h-10 w-40 rounded-lg"></div>
        <div class="skeleton-shimmer h-10 w-24 rounded-lg"></div>
      </div>
    </div>

    <!-- Main Content (only show after permissions load) -->
    <template v-else>
      <!-- <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-[rgb(var(--text))]">Configuration</h1>
      </div> -->
      <form @submit.prevent="saveConfig" class="max-w-2xl space-y-6">
    <!-- Mode Display (Read-only for now) -->
    <!-- <section class="card">
      <div class="flex items-center gap-3 mb-5">
        <div class="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
          <svg class="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
        </div>
        <h3 class="text-sm font-bold text-[rgb(var(--text))]">Operation Mode</h3>
      </div>
      <div class="space-y-3">
        <div class="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
          <div class="flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-blue-900 dark:text-blue-100 mb-1">Current Mode</p>
              <p class="text-sm font-bold text-blue-700 dark:text-blue-300 uppercase">
                {{ form.mode }}
              </p>
            </div>
            <div class="px-3 py-1 rounded-lg bg-blue-100 dark:bg-blue-800">
              <span class="text-xs font-bold text-blue-900 dark:text-blue-100">
                {{ form.mode === 'local' ? '🔒 Local' : '🌐 Live' }}
              </span>
            </div>
          </div>
        </div>
        <div class="text-xs text-[rgb(var(--text-secondary))] space-y-1">
          <p><strong>Local Mode:</strong> All data stored in local SQLite. Authorization via Cedar-WASM.</p>
          <p><strong>Live Mode:</strong> Data stored in Backend API. Authorization via external PDP.</p>
          <p class="text-[rgb(var(--text-muted))] italic mt-2">
            ⚠️ Mode switching requires restarting the proxy server.
          </p>
        </div>
      </div>
    </section> -->

    <!-- Server Settings -->
    <section class="card">
      <div class="flex items-center gap-3 mb-5">
        <div class="p-2 rounded-lg bg-purple-100 dark:bg-purple-900/30">
          <svg class="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
          </svg>
        </div>
        <h3 class="text-sm font-bold text-[rgb(var(--text))]">Server Settings</h3>
      </div>
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <UiInput v-model="form.server.host" label="Host" placeholder="127.0.0.1" :disabled="!canUpdateConfig" />
            <p class="text-xs text-[rgb(var(--text-secondary))] mt-1.5">
              Use <code class="font-mono">0.0.0.0</code> for network access
            </p>
          </div>
          <div>
            <UiInput v-model.number="form.server.port" label="Port" type="number" :disabled="!canUpdateConfig" />
            <p class="text-xs text-[rgb(var(--text-secondary))] mt-1.5">
              Auto-increments if port is in use
            </p>
          </div>
        </div>
        <div>
          <UiInput v-model="form.publicUrl" label="Public URL" type="url" placeholder="https://your-ngrok-url.ngrok.io" :disabled="!canUpdateConfig" />
          <p class="text-xs text-[rgb(var(--text-secondary))] mt-1.5">
            Optional: Public URL for sharing with users (ngrok, Tailscale, etc.)
          </p>
        </div>
        <div>
          <label class="block text-xs font-semibold text-[rgb(var(--text-secondary))] mb-1.5">Log Level</label>
          <select v-model="form.logLevel" class="input" :disabled="!canUpdateConfig">
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
        </div>
      </div>
    </section>

    <!-- Email Settings -->
    <section class="card">
      <div class="flex items-center gap-3 mb-5">
        <div class="p-2 rounded-lg bg-green-100 dark:bg-green-900/30">
          <svg class="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 class="text-sm font-bold text-[rgb(var(--text))]">Email Settings</h3>
      </div>
      <div class="space-y-4">
        <div class="flex items-center gap-2">
          <input
            type="checkbox"
            id="emailEnabled"
            v-model="form.email.enabled"
            class="w-4 h-4 rounded border-[rgb(var(--border))]"
            :disabled="!canUpdateConfig"
          />
          <label for="emailEnabled" class="text-sm font-semibold text-[rgb(var(--text))]">
            Enable Email Service
          </label>
        </div>
        
        <div v-if="form.email.enabled" class="space-y-4 pl-6 border-l-2 border-[rgb(var(--border))]">
          <div>
            <label class="block text-xs font-semibold text-[rgb(var(--text-secondary))] mb-1.5">Provider</label>
            <select v-model="form.email.provider" class="input" :disabled="!canUpdateConfig">
              <option value="manual">Manual (Log to Console)</option>
              <option value="smtp">SMTP</option>
              <option value="sendgrid">SendGrid</option>
              <option value="mailgun">Mailgun</option>
              <option value="ses">AWS SES</option>
            </select>
          </div>

          <!-- SMTP Settings -->
          <div v-if="form.email.provider === 'smtp'" class="space-y-3">
            <div class="grid grid-cols-2 gap-4">
              <UiInput v-model="form.email.smtp.host" label="SMTP Host" placeholder="smtp.gmail.com" :disabled="!canUpdateConfig" />
              <UiInput v-model.number="form.email.smtp.port" label="SMTP Port" type="number" :disabled="!canUpdateConfig" />
            </div>
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                id="smtpSecure"
                v-model="form.email.smtp.secure"
                class="w-4 h-4 rounded border-[rgb(var(--border))]"
                :disabled="!canUpdateConfig"
              />
              <label for="smtpSecure" class="text-sm text-[rgb(var(--text-secondary))]">
                Use TLS/SSL (for port 465 only)
              </label>
            </div>
            <p class="text-xs text-[rgb(var(--text-secondary))]">
              <strong>Note:</strong> Port 587 uses STARTTLS (leave unchecked). Port 465 uses SSL/TLS (check this box).
            </p>
            <div class="grid grid-cols-2 gap-4">
              <UiInput v-model="form.email.smtp.auth.user" label="SMTP Username" :disabled="!canUpdateConfig" />
              <UiInput v-model="form.email.smtp.auth.pass" label="SMTP Password" type="password" :disabled="!canUpdateConfig" />
            </div>
          </div>

          <!-- SendGrid Settings -->
          <div v-if="form.email.provider === 'sendgrid'" class="space-y-3">
            <UiInput v-model="form.email.sendgrid.apiKey" label="SendGrid API Key" type="password" :disabled="!canUpdateConfig" />
          </div>

          <!-- Mailgun Settings -->
          <div v-if="form.email.provider === 'mailgun'" class="space-y-3">
            <UiInput v-model="form.email.mailgun.apiKey" label="Mailgun API Key" type="password" :disabled="!canUpdateConfig" />
            <UiInput v-model="form.email.mailgun.domain" label="Sending Domain" placeholder="mg.example.com" :disabled="!canUpdateConfig" />
            <div>
              <UiInput v-model="form.email.mailgun.apiUrl" label="API URL (optional)" placeholder="https://api.mailgun.net" :disabled="!canUpdateConfig" />
              <p class="text-xs text-[rgb(var(--text-secondary))] mt-1.5">
                Leave empty for US region. Use <code class="font-mono">https://api.eu.mailgun.net</code> for EU region.
              </p>
            </div>
          </div>

          <!-- AWS SES Settings -->
          <div v-if="form.email.provider === 'ses'" class="space-y-3">
            <UiInput v-model="form.email.ses.accessKeyId" label="Access Key ID" type="text" placeholder="AKIA..." :disabled="!canUpdateConfig" />
            <UiInput v-model="form.email.ses.secretAccessKey" label="Secret Access Key" type="password" :disabled="!canUpdateConfig" />
            <UiInput v-model="form.email.ses.region" label="Region" placeholder="us-east-1" :disabled="!canUpdateConfig" />
            <p class="text-xs text-[rgb(var(--text-secondary))]">
              The From address must be verified in AWS SES (e.g. via SES console or VerifyEmailIdentity).
            </p>
          </div>

          <!-- From Address (SendGrid, Mailgun, and SES) -->
          <div v-if="form.email.provider === 'sendgrid' || form.email.provider === 'mailgun' || form.email.provider === 'ses'">
            <UiInput v-model="form.email.from" label="From Address" type="text" placeholder="noreply@example.com or Name &lt;noreply@example.com&gt;" :disabled="!canUpdateConfig" />
          </div>
        </div>
      </div>
    </section>

    <!-- Root Key (Read-only) -->
    <!-- <section class="card" v-if="configStore.rootKey">
      <div class="flex items-center gap-3 mb-5">
        <div class="p-2 rounded-lg bg-yellow-100 dark:bg-yellow-900/30">
          <svg class="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
          </svg>
        </div>
        <h3 class="text-sm font-bold text-[rgb(var(--text))]">Root Key</h3>
      </div>
      <div class="space-y-3">
        <div class="p-3 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
          <div class="flex items-center justify-between mb-2">
            <p class="text-xs font-semibold text-yellow-900 dark:text-yellow-100">Root Key</p>
            <div class="flex gap-2">
              <button
                type="button"
                @click="showRootKey = !showRootKey"
                class="text-xs px-2 py-1 rounded bg-yellow-100 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 hover:bg-yellow-200 dark:hover:bg-yellow-700 transition-colors"
              >
                {{ showRootKey ? 'Hide' : 'Show' }}
              </button>
              <button
                type="button"
                @click="copyMasterKey"
                class="text-xs px-2 py-1 rounded bg-yellow-100 dark:bg-yellow-800 text-yellow-900 dark:text-yellow-100 hover:bg-yellow-200 dark:hover:bg-yellow-700 transition-colors"
              >
                Copy
              </button>
            </div>
          </div>
          <code class="text-xs font-mono text-yellow-800 dark:text-yellow-200 break-all">
            {{ showRootKey ? configStore.rootKey : '••••••••••••••••••••••••••••••••' }}
          </code>
        </div>
        <p class="text-xs text-[rgb(var(--text-secondary))]">
          ⚠️ This root key is required for all admin operations. Store it securely.
        </p>
      </div>
    </section> -->

    <!-- Actions -->
    <div class="flex gap-3">
      <UiButton type="submit" :loading="isSaving" :disabled="!canUpdateConfig">
        Save Configuration
      </UiButton>
      <UiButton type="button" variant="ghost" @click="resetToDefaults" :disabled="!canUpdateConfig">
        Reset
      </UiButton>
    </div>
      </form>
    </template>
  </div>
</template>
