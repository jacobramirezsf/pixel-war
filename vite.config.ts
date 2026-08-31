import { readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Chrome refuses module scripts and crossorigin stylesheets on file:// pages.
// After the build, fold the one JS chunk and the one CSS file into index.html so the
// game runs when opened straight from disk, from a subfolder, or inside a webview.
function inlineBuild(): Plugin {
  let outDir = 'dist';
  return {
    name: 'pixel-war-inline',
    apply: 'build',
    configResolved(c) { outDir = c.build.outDir; },
    closeBundle() {
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
  plugins: [inlineBuild()],
});
