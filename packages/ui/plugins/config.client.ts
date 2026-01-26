 
export default defineNuxtPlugin(async () => {
    const configStore = useConfigStore()
    
 
    await configStore.loadFromStorage()
})
