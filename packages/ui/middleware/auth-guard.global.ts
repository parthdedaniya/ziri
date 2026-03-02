import { getAdminOnlyPages } from '~/composables/useNavigation'
import { useAdminAuthStore } from '~/stores/admin-auth'
import { useUserAuthStore } from '~/stores/user-auth'

const USER_PAGES = ['/me']

function matchesRoute(path: string, route: string): boolean {
  return path === route || path.startsWith(`${route}/`)
}

export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) {
    return
  }

  if (to.path.startsWith('/api/') || to.path === '/login') {
    return
  }

  const adminAuthStore = useAdminAuthStore()
  const userAuthStore = useUserAuthStore()
  const toast = useToast()

  adminAuthStore.loadFromStorage()
  userAuthStore.loadFromStorage()
  await nextTick()

  if (adminAuthStore.isAuthenticated) {
    try {
      const sessionValid = await adminAuthStore.checkServerSession()
      if (!sessionValid) {
        toast.warning('Server restarted. Please login again.')
        return navigateTo('/login')
      }
    } catch (error) {
      console.error('[AUTH] Failed to check server session:', error)
    }
  }

  const isAdminAuthenticated = adminAuthStore.isAuthenticated
  const isUserAuthenticated = userAuthStore.isAuthenticated
  const userRole = userAuthStore.user?.role || adminAuthStore.user?.role

  if (!isAdminAuthenticated && !isUserAuthenticated) {
    toast.warning('Please login to continue')
    return navigateTo('/login')
  }

  if (to.path === '/' && to.query.create === 'true' && to.query.policy) {
    return navigateTo({
      path: '/rules',
      query: {
        create: to.query.create,
        policy: to.query.policy
      }
    })
  }

  const isDashboardUser = Boolean(userRole && userRole !== 'user')
  const isAdminPage = getAdminOnlyPages().some(page => matchesRoute(to.path, page))
  const isUserPage = USER_PAGES.some(page => matchesRoute(to.path, page))

  if ((to.path === '/config' || to.path === '/settings/manage-users') && userRole !== 'admin') {
    toast.warning('Admin access required')
    return navigateTo('/')
  }

  if (isAdminPage && !isDashboardUser) {
    toast.warning('Dashboard access required')
    return navigateTo('/me')
  }

  if (isUserPage) {
    return
  }

  if (isAdminAuthenticated && isDashboardUser && isAdminPage) {
    return
  }
})
