import { defineConfig } from 'vite';

/*
 * `base` is relative rather than absolute so one build works everywhere: served
 * from a GitHub Pages project subpath (/CQJC-3D/), from a domain root, and from
 * the `file:`-style origin an Android WebView uses when it loads the bundled
 * copy. An absolute base would break the last two.
 */
export default defineConfig({
  base: './',
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0,   // keep the GLB and textures as real files
    chunkSizeWarningLimit: 1200,
  },
  server: {
    port: 5183,
    host: '127.0.0.1',
  },
});
