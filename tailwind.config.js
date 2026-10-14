/** @type {import('tailwindcss').Config} */
const v = (name) => `rgb(var(--c-${name}) / <alpha-value>)`
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: v('bg'), surface: v('surface'), surface2: v('surface2'), surface3: v('surface3'), line: v('line'),
        fg: v('fg'), muted: v('muted'), accent: v('accent'), ink: v('ink'), ok: v('ok'), danger: v('danger')
      },
      borderRadius: { lg: 'var(--r-lg)', xl: 'var(--r-xl)', '2xl': 'var(--r-2xl)' },
      fontFamily: {
        display: ['"Barlow Condensed"', '"Arial Narrow"', 'system-ui', 'sans-serif'],
        body: ['Manrope', 'system-ui', '-apple-system', 'sans-serif'],
        data: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'monospace']
      }
    }
  },
  plugins: []
}
