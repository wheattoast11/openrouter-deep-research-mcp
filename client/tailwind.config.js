/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'terminal': {
          bg: '#0b1220',
          card: '#0f172a',
          border: '#1f2a44',
          text: '#e5e7eb',
          muted: '#6b7280',
          accent: '#3b82f6',
          success: '#22c55e',
          warning: '#f59e0b',
          error: '#ef4444'
        }
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}

