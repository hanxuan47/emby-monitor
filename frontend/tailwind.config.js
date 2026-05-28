/** @type {import('tailwindcss').Config} */
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
  plugins: [],
}
