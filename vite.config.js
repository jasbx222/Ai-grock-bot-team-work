import { defineConfig } from 'vite';
// base './' so the build works from any folder (static server or the Flutter app's local server)
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsInlineLimit: 0, chunkSizeWarningLimit: 1500 },
});
