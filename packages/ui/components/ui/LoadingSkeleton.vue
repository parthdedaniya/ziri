<script setup lang="ts">
interface Props {
  lines?: number
  height?: string
  width?: string
  rounded?: string
}

const props = withDefaults(defineProps<Props>(), {
  lines: 3,
  height: 'h-4',
  width: undefined,
  rounded: 'rounded-lg'
})

// Generate random widths for each line
const lineWidths = computed(() => {
  return Array.from({ length: props.lines }, () => {
    return `${70 + Math.random() * 30}%`
  })
})
</script>

<template>
  <div class="space-y-2">
    <div 
      v-for="(width, i) in lineWidths" 
      :key="i" 
      class="skeleton-shimmer relative overflow-hidden"
      :class="[height, rounded]"
      :style="{ width: props.width || width }"
    >
      <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer"></div>
    </div>
  </div>
</template>

<style scoped>
.skeleton-shimmer {
  background: rgb(var(--surface-elevated));
  position: relative;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.animate-shimmer {
  animation: shimmer 1.5s ease-in-out infinite;
}

/* Dark mode support */
.dark .skeleton-shimmer {
  background: rgba(255, 255, 255, 0.05);
}

.dark .animate-shimmer {
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.1),
    transparent
  );
}
</style>
