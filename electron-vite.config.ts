import { defineConfig, externalizeDepsPlugin } from 'electron-vite'

// Keep native deps (better-sqlite3) as runtime requires — bundling .node files breaks.
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        external: ['better-sqlite3']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {}
})
