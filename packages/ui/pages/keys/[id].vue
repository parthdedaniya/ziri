<script setup lang="ts">
import { useKeys } from '~/composables/useKeys'
import { useConfigStore } from '~/stores/config'
import { useToast } from '~/composables/useToast'
import { formatCurrency, formatDate, formatPercent, maskApiKey } from '~/utils/formatters'
import type { Key } from '~/types/entity'

const route = useRoute()
const router = useRouter()
const configStore = useConfigStore()
const { getKey, getKeyByUserId, revokeKey, currentKey, loading } = useKeys()
const toast = useToast()

const routeId = route.params.id as string
// The route param could be either userKeyId or userId - try both
const userId = routeId

// Demo key data
const demoKey = ref<Key>({
  userId: routeId,
  name: 'Alice Smith',
  email: 'alice@company.com',
  department: 'Engineering',
  isAgent: false,
  limitRequestsPerMinute: 100,
  apiKey: 'sk-abc123def456ghi789jkl012mno345pqr678stu901vwx234',
  currentDailySpend: 12.34,
  currentMonthlySpend: 156.78,
  lastDailyReset: '2026-01-08T00:00:00Z',
  lastMonthlyReset: '2026-01-01T00:00:00Z',
  status: 'active',
  createdAt: '2026-01-01T10:00:00Z'
})

const key = computed(() => currentKey.value || demoKey.value)

// Generate demo chart data
const dailySpendData = computed(() => {
  const labels = []
  const values = []
  const today = new Date()
  
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    labels.push(date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    values.push(Math.random() * 15 + 5)
  }
  values[29] = key.value.currentDailySpend
  
  return { labels, values }
})

const monthlySpendData = computed(() => {
  const labels = ['Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec', 'Jan']
  const values = labels.map(() => Math.random() * 300 + 100)
  values[11] = key.value.currentMonthlySpend
  
  return { labels, values }
})

const handleRevoke = async () => {
  try {
    const keyToRevoke = currentKey.value || demoKey.value
    if (keyToRevoke.userId) {
      await revokeKey(keyToRevoke.userId)
      demoKey.value.status = 'revoked'
    }
  } catch (e) {
    // Error handled by composable
  }
}

const goBack = () => {
  router.push('/keys')
}

onMounted(async () => {
  await nextTick()
  
  if (configStore.isConfigured) {
    try {
      // Try getKey first (if routeId is userKeyId), then fallback to getKeyByUserId (if routeId is userId)
      try {
        await getKey(routeId)
      } catch {
        // If getKey fails, try getKeyByUserId
        await getKeyByUserId(routeId)
      }
    } catch (e) {
      // Error handled by composable
    }
  }
})
</script>

<template>
  <div class="space-y-6">
    <!-- Back button -->
    <button 
      @click="goBack"
      class="inline-flex items-center gap-2 text-sm font-medium text-[rgb(var(--text-secondary))] hover:text-[rgb(var(--text))] transition-colors group"
    >
      <svg class="w-4 h-4 transition-transform group-hover:-translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
      </svg>
      Back to Keys
    </button>

    <div v-if="loading" class="p-6">
      <UiLoadingSkeleton :lines="8" height="h-6" />
    </div>

    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <!-- Key Info Card -->
      <div class="card">
        <div class="flex items-center justify-between mb-5">
          <h2 class="text-base font-bold text-[rgb(var(--text))]">Key Details</h2>
          <span :class="key.status === 'active' ? 'badge-success' : 'badge-danger'" class="badge">
            <span class="w-1.5 h-1.5 rounded-full bg-current"></span>
            {{ key.status }}
          </span>
        </div>
        
        <div class="space-y-4">
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="text-xs font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wider mb-1">User ID</p>
              <code class="px-2 py-1 rounded-md bg-indigo-50 dark:bg-indigo-900/30 font-mono text-sm text-indigo-600 dark:text-indigo-400 font-semibold">{{ key.userId }}</code>
            </div>
            <div>
              <p class="text-xs font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wider mb-1">Is Agent</p>
              <p class="text-sm text-[rgb(var(--text))]">{{ key.isAgent ? 'Yes' : 'No' }}</p>
            </div>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
            <p class="text-xs font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wider mb-1">Email</p>
            <p class="text-sm text-[rgb(var(--text))]">{{ key.email }}</p>
          </div>
            <div>
              <p class="text-xs font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wider mb-1">Department</p>
              <p class="text-sm text-[rgb(var(--text))]">{{ key.department }}</p>
            </div>
          </div>
          
          
          
          <div class="pt-4 border-t-2 border-[rgb(var(--border))]">
            <div class="flex items-center justify-between mb-2">
              <p class="text-xs font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wider">API Key</p>
              <UiCopyButton :text="key.apiKey" size="sm" />
            </div>
            <code class="block p-3 rounded-lg bg-[rgb(var(--surface-elevated))] text-xs font-mono break-all text-[rgb(var(--text))]">
              {{ maskApiKey(key.apiKey) }}
            </code>
          </div>
          
          <div class="grid grid-cols-2 gap-4 pt-4 border-t-2 border-[rgb(var(--border))]">
            <div>
              <p class="text-xs font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wider mb-1">Created</p>
              <p class="text-sm text-[rgb(var(--text))]">{{ formatDate(key.createdAt) }}</p>
            </div>
            <div>
              <p class="text-xs font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wider mb-1">Last Daily Reset</p>
              <p class="text-sm text-[rgb(var(--text))]">{{ formatDate(key.lastDailyReset || '') }}</p>
            </div>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <p class="text-xs font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wider mb-1">Rate Limit</p>
              <p class="text-sm font-medium text-[rgb(var(--text))]">{{ key.limitRequestsPerMinute || 0 }} req/min</p>
            </div>
            <div>
              <p class="text-xs font-semibold text-[rgb(var(--text-muted))] uppercase tracking-wider mb-1">Last Monthly Reset</p>
              <p class="text-sm text-[rgb(var(--text))]">{{ formatDate(key.lastMonthlyReset || '') }}</p>
            </div>
          </div>
        </div>
        
        <UiButton 
          v-if="key.status === 'active'"
          variant="danger" 
          class="w-full mt-6"
          @click="handleRevoke"
          :loading="loading"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
          Revoke Key
        </UiButton>
      </div>
      
      <!-- Spend Charts -->
      <div class="space-y-6">
        <!-- Daily Spend Chart -->
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-[rgb(var(--text))]">Daily Spend</h3>
            <span class="badge badge-neutral">Last 30 days</span>
          </div>
          
          <div class="mb-4">
            <div class="flex justify-between text-sm mb-2">
              <span class="font-semibold text-[rgb(var(--text))]">Today: {{ formatCurrency(key.currentDailySpend) }}</span>
              <span class="text-[rgb(var(--text-muted))]">Reset: {{ formatDate(key.lastDailyReset || '') }}</span>
            </div>
            <div class="progress-bar h-3">
              <div 
                class="progress-bar-fill bg-gradient-to-r from-indigo-500 to-purple-500" 
                :style="{ width: `${Math.min(100, (key.currentDailySpend / 100) * 100)}%` }"
              />
            </div>
          </div>
          
          <KeysSpendChart :data="dailySpendData" type="line" color="blue" />
        </div>
        
        <!-- Monthly Spend Chart -->
        <div class="card">
          <div class="flex items-center justify-between mb-4">
            <h3 class="text-sm font-bold text-[rgb(var(--text))]">Monthly Spend</h3>
            <span class="badge badge-neutral">Last 12 months</span>
          </div>
          
          <div class="mb-4">
            <div class="flex justify-between text-sm mb-2">
              <span class="font-semibold text-[rgb(var(--text))]">This month: {{ formatCurrency(key.currentMonthlySpend) }}</span>
              <span class="text-[rgb(var(--text-muted))]">Reset: {{ formatDate(key.lastMonthlyReset || '') }}</span>
            </div>
            <div class="progress-bar h-3">
              <div 
                class="progress-bar-fill bg-gradient-to-r from-green-500 to-emerald-500" 
                :style="{ width: `${Math.min(100, (key.currentMonthlySpend / 1000) * 100)}%` }"
              />
            </div>
          </div>
          
          <KeysSpendChart :data="monthlySpendData" type="bar" color="green" />
        </div>
      </div>
    </div>
  </div>
</template>
