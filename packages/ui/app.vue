<script setup lang="ts">
import { useConfigStore } from '~/stores/config'
import { useAdminAuthStore } from '~/stores/admin-auth'

const configStore = useConfigStore()
const adminAuthStore = useAdminAuthStore()

 
 
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
