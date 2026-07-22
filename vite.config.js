import { defineConfig } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  plugins: [
    nodePolyfills({
      // Habilita los polyfills necesarios para la librería de Telegram
      protocolImports: true,
    }),
  ],
})