import { fileURLToPath, URL } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The dev server proxies `/api` to the Nest API so the browser
 * only ever talks to one origin.
 *
 * Without the proxy the httpOnly session cookie would be
 * cross-site, and `SameSite=Strict` — which is what the API
 * sets — means the browser will not send it at all. Serving
 * through one origin is not a convenience here, it is what
 * makes cookie authentication work in development.
 */
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: false,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
