import { defineConfig, type Plugin } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';

/** Stamps the service worker with a build id so every deploy invalidates the old cache. */
function stampServiceWorker(): Plugin {
  return {
    name: 'stamp-sw',
    apply: 'build',
    closeBundle() {
      const file = 'dist/sw.js';
      try { writeFileSync(file, readFileSync(file, 'utf8').replaceAll('__BUILD__', Date.now().toString(36))); }
      catch (e) { console.warn('sw stamp skipped:', e); }
    },
  };
}

// Relative base so the build works on GitHub Pages under /<repo>/.
export default defineConfig({
  base: './',
  plugins: [stampServiceWorker()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
