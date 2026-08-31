import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// Chrome refuses module scripts and crossorigin stylesheets on file:// pages.
// After the build, fold the one JS chunk and the one CSS file into index.html so the
// game runs when opened straight from disk, from a subfolder, or inside a webview.
function inlineBuild(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pixel-war-inline',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    // writeBundle runs before the PWA plugin builds its precache list in closeBundle.
    writeBundle() {
      const htmlPath = join(outDir, 'index.html');
      let html = readFileSync(htmlPath, 'utf8');
      const assets = join(outDir, 'assets');
      for (const f of readdirSync(assets)) {
        const p = join(assets, f);
        if (f.endsWith('.js')) {
          // A classic script must run after the body exists, so it moves to the end of the page.
          const tag = new RegExp('<script[^>]*src="\\./assets/' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*></script>\\s*');
          html = html.replace(tag, '');
          html = html.replace('</body>', () => '<script>' + readFileSync(p, 'utf8') + '</script>\n</body>');
          rmSync(p);
        } else if (f.endsWith('.css')) {
          const tag = new RegExp('<link[^>]*href="\\./assets/' + f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"[^>]*>');
          html = html.replace(tag, () => '<style>' + readFileSync(p, 'utf8') + '</style>');
          rmSync(p);
        }
      }
      writeFileSync(htmlPath, html);
    },
  };
}

export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    // Fonts are about 10 KB each. Inline them so the CSS has no file references.
    assetsInlineLimit: 24 * 1024,
    modulePreload: { polyfill: false },
  },
  plugins: [
    inlineBuild(),
    // Offline caching is a convenience. The game never depends on the service worker.
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Pixel War',
        short_name: 'Pixel War',
        description: 'A pixel-art real-time strategy game.',
        start_url: './',
        scope: './',
        display: 'fullscreen',
        orientation: 'any',
        background_color: '#0a0b10',
        theme_color: '#0a0b10',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{html,png,webmanifest}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
