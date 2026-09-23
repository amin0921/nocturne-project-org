/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0A0B0E',
        surface: '#121419',
        raised: '#1A1E27',
        line: '#232936',
        linestrong: '#2E3648',
        ink: '#F2F3F5',
        muted: '#A8B0BE',
        faint: '#6B7484',
        ember: '#EAB308',
        emberhover: '#F5C518'
      }
    }
  },
  plugins: []
}
