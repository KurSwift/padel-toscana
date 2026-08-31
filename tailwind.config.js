/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Valores reales en :root de src/index.css (default = paleta
        // verde) — ThemeProvider (src/context/ThemeContext.tsx) los
        // sobreescribe en runtime según settings/theme en Firestore. Ver
        // src/theme/palettes.ts (Epic #43, issue 5/5).
        brand: {
          50:  'var(--brand-50)',
          100: 'var(--brand-100)',
          200: 'var(--brand-200)',
          300: 'var(--brand-300)',
          400: 'var(--brand-400)',
          500: 'var(--brand-500)',
          600: 'var(--brand-600)',
          700: 'var(--brand-700)',
          800: 'var(--brand-800)',
          900: 'var(--brand-900)',
        },
      },
    },
  },
  plugins: [],
}
