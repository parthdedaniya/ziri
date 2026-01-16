// Client-side plugin to load config on app initialization
export default defineNuxtPlugin(async () => {
    const configStore = useConfigStore()
    
    // Load config from config file API (or localStorage fallback) when app starts
    await configStore.loadFromStorage()
})
