// Auth middleware - checks if user is authenticated (any role)

export default defineNuxtRouteMiddleware(async (to) => {
    // Only run on client side
    if (import.meta.server) {
        return
    }

    // Skip API routes
    if (to.path.startsWith('/api/')) {
        return
    }

    // Always allow access to login page
    if (to.path === '/login') {
        return
    }

    // Check both admin and user authentication
    const { useAdminAuthStore } = await import('~/stores/admin-auth')
    const { useUserAuthStore } = await import('~/stores/user-auth')
    
    const adminAuthStore = useAdminAuthStore()
    const userAuthStore = useUserAuthStore()
    
    adminAuthStore.loadFromStorage()
    userAuthStore.loadFromStorage()

    const isAdminAuthenticated = adminAuthStore.isAuthenticated
    const isUserAuthenticated = userAuthStore.isAuthenticated

    // If not authenticated at all, redirect to login
    if (!isAdminAuthenticated && !isUserAuthenticated) {
        const toast = useToast()
        toast.warning('Please login to continue')
        return navigateTo('/login')
    }
})
