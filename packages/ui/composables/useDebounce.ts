 

import { ref, watch, type Ref } from 'vue'

 
export function useDebounce<T>(source: Ref<T>, delay: number = 300): Ref<T> {
  const debounced = ref(source.value) as Ref<T>
  let timeoutId: NodeJS.Timeout | null = null

  watch(source, (newValue) => {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    
    timeoutId = setTimeout(() => {
      debounced.value = newValue
    }, delay)
  }, { immediate: true })

  return debounced
}

 
export function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = 300
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null

  return function (this: any, ...args: Parameters<T>) {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
    
    timeoutId = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}
