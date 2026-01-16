<script setup lang="ts">
import { useConfigStore } from '~/stores/config'
import { useAdminAuthStore } from '~/stores/admin-auth'

const configStore = useConfigStore()
const adminAuthStore = useAdminAuthStore()

// NOTE: Auth loading happens in middleware (single source of truth)
// This is just for app.vue's own reactive state, but don't rely on it for auth checks
if (import.meta.client) {
  configStore.loadFromStorage()
  await nextTick()
}
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
