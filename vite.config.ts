import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const tauriDevHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  build: {
    outDir: 'dist/client',
    target:
      process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
  },
  clearScreen: false,
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  plugins: [react()],
  server: {
    host: tauriDevHost ?? '127.0.0.1',
    hmr: tauriDevHost
      ? {
          host: tauriDevHost,
          port: 1421,
          protocol: 'ws',
        }
      : undefined,
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:5174',
    },
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
});
