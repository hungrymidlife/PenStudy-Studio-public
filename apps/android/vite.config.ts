import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Tauri Android may connect over the PC's LAN address rather than localhost.
// HMR must use the same address or its WebSocket connection fails.
const mobileHost = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: {
    host: mobileHost || '0.0.0.0',
    port: 1421,
    strictPort: true,
    hmr: mobileHost ? { protocol: 'ws', host: mobileHost, port: 1421 } : undefined,
    watch: {
      ignored: ['**/src-tauri/**', '**/target/**', '**/dist/**', '**/node_modules/**']
    }
  }
});
