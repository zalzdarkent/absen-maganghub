import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Forward API calls to the existing Express backend (server.js) during dev
      '/api': {
        target: 'http://localhost:4174',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Build straight into the Express app's static folder so `server.js`
    // can keep serving the app from /public in production, unchanged.
    outDir: '../public',
    emptyOutDir: true,
  },
});
