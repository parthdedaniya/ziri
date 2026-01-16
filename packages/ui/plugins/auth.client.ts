// Client-side plugin to load auth state BEFORE middleware runs
// This ensures auth state is available when middleware checks it
export default defineNuxtPlugin(() => {
    // Import stores directly (Pinia is auto-imported in Nuxt)
    const adminAuthStore = useAdminAuthStore()
    const userAuthStore = useUserAuthStore()
    
    // Load auth state synchronously (loadFromStorage is sync)
    adminAuthStore.loadFromStorage()
    userAuthStore.loadFromStorage()
})
