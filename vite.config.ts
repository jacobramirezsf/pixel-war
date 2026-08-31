import { defineConfig } from 'vite';

// Relative base so the build runs from a local file path, a subfolder, or a webview.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
});
