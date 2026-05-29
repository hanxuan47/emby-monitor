/** @type {import('tailwindcss').Config} */
const plugin = require('tailwindcss/plugin')

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        glass: 'rgba(255,255,255,0.06)',
        'glass-2': 'rgba(255,255,255,0.10)',
        border: 'rgba(255,255,255,0.07)',
        'border-2': 'rgba(255,255,255,0.12)',
      },
    },
  },
  plugins: [
    // Add max-* breakpoint variants (max-sm:, max-md:, max-lg:, max-xl:, max-2xl:)
    // These work like: max-md:hidden = hidden on screens ≤ md breakpoint
    plugin(function ({ matchVariant, theme }) {
      matchVariant(
        'max',
        (value) => {
          // Use the theme's screen values for breakpoints
          const screens = theme('screens')
          // For named breakpoints like 'md', resolve to the actual value
          const resolvedValue = screens[value] || value
          return `@media (max-width: ${resolvedValue})`
        },
        {
          values: theme('screens'),
          sort(a, b) {
            // Sort max-width queries in descending order
            return parseInt(b.value) - parseInt(a.value)
          },
        }
      )
    }),
  ],
}
