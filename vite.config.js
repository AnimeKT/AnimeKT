import { defineConfig } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    nodePolyfills({
      include: ['buffer', 'util', 'stream', 'crypto', 'os', 'events', 'path'],
      globals: {
        Buffer: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        home: resolve(__dirname, 'home.html'),
        datos: resolve(__dirname, 'Datos.html'),
        favoritos: resolve(__dirname, 'Favoritos.html'),
        buscador: resolve(__dirname, 'buscador.html'),
        ver: resolve(__dirname, 'Ver.html')
      }
    }
  }
});