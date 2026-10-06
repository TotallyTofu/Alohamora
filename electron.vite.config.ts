import { resolve } from 'path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';

const alias = { '@shared': resolve('src/shared') };

// electron-vite's isolated-entries progress reporter calls TTY-only methods; without this guard the build
// crashes whenever stdout is a pipe or file (CI, `npm run build > log`).
const out = process.stdout as unknown as Record<string, unknown>;
if (!process.stdout.isTTY) {
  out.clearLine ??= (): boolean => true;
  out.cursorTo ??= (): boolean => true;
  out.moveCursor ??= (): boolean => true;
}

// electron-vite 5 externalizes node_modules dependencies by default (no externalizeDepsPlugin needed).
export default defineConfig({
  main: {
    resolve: { alias }
  },
  preload: {
    resolve: { alias },
    build: {
      // Sandboxed preload scripts cannot require() sibling chunks, so each entry must be self-contained.
      isolatedEntries: true,
      rollupOptions: {
        input: { index: resolve('src/preload/index.ts'), engine: resolve('src/preload/engine.ts') }
      }
    }
  },
  renderer: {
    resolve: { alias: { ...alias, '@renderer': resolve('src/renderer/src') } },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html'), engine: resolve('src/renderer/engine.html') }
      }
    }
  }
});
