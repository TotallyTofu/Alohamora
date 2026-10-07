import { resolve } from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The UI is a plain Vite + React app; Tauri loads dist/renderer (see src-tauri/tauri.conf.json).
export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [react()],
  resolve: { alias: { '@shared': resolve('src/shared'), '@renderer': resolve('src/renderer/src') } },
  clearScreen: false,
  server: { port: 5173, strictPort: true },
  build: { outDir: resolve('dist/renderer'), emptyOutDir: true, target: ['es2022', 'safari16'] }
});
