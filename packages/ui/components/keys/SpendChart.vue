<script setup lang="ts">
import { Line, Bar, Pie } from 'vue-chartjs'
import { 
  Chart as ChartJS, 
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement,
  BarElement,
  ArcElement,
  Title, 
  Tooltip, 
  Legend,
  Filler
} from 'chart.js'

ChartJS.register(
  CategoryScale, 
  LinearScale, 
  PointElement, 
  LineElement,
  BarElement,
  ArcElement,
  Title, 
  Tooltip, 
  Legend,
  Filler
)

interface Props {
  type: 'line' | 'bar' | 'pie'
  data: { labels: string[], values: number[] }
  color?: string
}

const props = withDefaults(defineProps<Props>(), {
  color: 'blue'
})

const colorMap = {
  blue: { bg: 'rgba(59, 130, 246, 0.1)', border: 'rgb(59, 130, 246)' },
  green: { bg: 'rgba(34, 197, 94, 0.1)', border: 'rgb(34, 197, 94)' },
  purple: { bg: 'rgba(168, 85, 247, 0.1)', border: 'rgb(168, 85, 247)' }
}

const pieColors = [
  'rgba(59, 130, 246, 0.85)',
  'rgba(34, 197, 94, 0.85)',
  'rgba(168, 85, 247, 0.85)',
  'rgba(245, 158, 11, 0.85)',
  'rgba(236, 72, 153, 0.85)',
  'rgba(20, 184, 166, 0.85)',
  'rgba(99, 102, 241, 0.85)',
  'rgba(239, 68, 68, 0.85)'
]

const chartData = computed(() => ({
  labels: props.data.labels,
  datasets: [
    {
      data: props.data.values,
      backgroundColor: props.type === 'pie'
        ? props.data.values.map((_, idx) => pieColors[idx % pieColors.length])
        : colorMap[props.color as keyof typeof colorMap]?.bg || colorMap.blue.bg,
      borderColor: props.type === 'pie'
        ? 'rgba(17, 24, 39, 0.15)'
        : colorMap[props.color as keyof typeof colorMap]?.border || colorMap.blue.border,
      borderWidth: props.type === 'pie' ? 1 : 2,
      fill: props.type !== 'pie',
      tension: props.type === 'line' ? 0.4 : 0,
      pointRadius: props.type === 'line' ? 2 : 0,
      pointHoverRadius: props.type === 'line' ? 4 : 0
    }
  ]
}))

const chartOptions = computed(() => {
  if (props.type === 'pie') {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          titleFont: { size: 10 },
          bodyFont: { size: 10 },
          padding: 8,
          callbacks: {
            label: (context: any) => {
              const value = Number(context.raw || 0)
              const total = context.dataset.data.reduce((sum: number, item: number) => sum + item, 0)
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : '0.0'
              return `${context.label}: ${pct}%`
            }
          }
        }
      }
    }
  }

  return {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false
    },
    tooltip: {
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      titleFont: { size: 10 },
      bodyFont: { size: 10 },
      padding: 8,
      displayColors: false,
      callbacks: {
        label: (context: any) => `$${context.parsed.y.toFixed(2)}`
      }
    }
  },
  scales: {
    x: {
      grid: { display: false },
      ticks: { 
        font: { size: 9 },
        color: '#9CA3AF'
      }
    },
    y: {
      beginAtZero: true,
      grid: { color: 'rgba(156, 163, 175, 0.1)' },
      ticks: { 
        font: { size: 9 },
        color: '#9CA3AF',
        callback: (value: number) => `$${value}`
      }
    }
  }
  }
})
</script>

<template>
  <div class="h-40">
    <Line v-if="type === 'line'" :data="chartData" :options="chartOptions" />
    <Bar v-else-if="type === 'bar'" :data="chartData" :options="chartOptions" />
    <Pie v-else :data="chartData" :options="chartOptions" />
  </div>
</template>
