import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    // Three.js alone is ~550 kB minified; warn only if the bundle grows well past that.
    chunkSizeWarningLimit: 800,
  },
})
