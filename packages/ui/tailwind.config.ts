import type { Config } from 'tailwindcss'

export default {
    darkMode: 'class',
    content: [
        './components *.vue',
        './pages *.{js,ts}',
        './plugins/**/*.{js,ts}',
        './app.vue',
        './error.vue'
    ],
    theme: {
        extend: {
            fontFamily: {
                mono: ['ui-monospace', 'SFMono-Regular', 'Menlo', 'Monaco', 'Consolas', 'Liberation Mono', 'Courier New', 'monospace']
            }
        }
    },
    plugins: []
} satisfies Config
