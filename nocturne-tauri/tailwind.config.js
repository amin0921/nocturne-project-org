/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
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
        emberhover: '#F5C518',
        // Semantic aliases (vibefarsi-compatible) over the same Nocturne tokens.
        background: '#0A0B0E',
        foreground: '#F2F3F5',
        primary: '#EAB308',
        border: '#232936'
      },
      boxShadow: {
        island: '0 8px 32px 0 rgba(0, 0, 0, 0.45)',
        capsule: '0 20px 50px -10px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 255, 255, 0.08)'
      }
    }
  },
  plugins: []
}
