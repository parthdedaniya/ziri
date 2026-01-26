 

export default defineNuxtRouteMiddleware(async (to) => {
 
    if (import.meta.server) {
        return
    }

 
    if (to.path.startsWith('/api/')) {
        return
    }

 
    if (to.path === '/login') {
        return
    }

 
    const { useAdminAuthStore } = await import('~/stores/admin-auth')
    const { useUserAuthStore } = await import('~/stores/user-auth')
    
    const adminAuthStore = useAdminAuthStore()
    const userAuthStore = useUserAuthStore()
    
    adminAuthStore.loadFromStorage()
    userAuthStore.loadFromStorage()

    const isAdminAuthenticated = adminAuthStore.isAuthenticated
    const isUserAuthenticated = userAuthStore.isAuthenticated

 
    if (!isAdminAuthenticated && !isUserAuthenticated) {
        const toast = useToast()
        toast.warning('Please login to continue')
        return navigateTo('/login')
    }
})
