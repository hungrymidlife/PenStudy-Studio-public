import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({
  plugins:[react()],clearScreen:false,
  server:{port:1420,strictPort:true,host:'127.0.0.1',watch:{ignored:['**/src-tauri/**','**/target/**','**/dist/**','**/node_modules/**']}},
  build:{rollupOptions:{input:{main:fileURLToPath(new URL('./index.html',import.meta.url)),overlay:fileURLToPath(new URL('./overlay.html',import.meta.url)),toolbar:fileURLToPath(new URL('./toolbar.html',import.meta.url))}}}
});
