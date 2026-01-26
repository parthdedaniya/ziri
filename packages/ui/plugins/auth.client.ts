 
 
export default defineNuxtPlugin(() => {
 
    const adminAuthStore = useAdminAuthStore()
    const userAuthStore = useUserAuthStore()
    
 
    adminAuthStore.loadFromStorage()
    userAuthStore.loadFromStorage()
})
