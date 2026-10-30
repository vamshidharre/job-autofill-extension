import { defineConfig } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import { build as bundleScript } from 'esbuild';

function copyExtensionAssets() {
  return {
    name: 'copy-extension-assets',
    async closeBundle() {
      const distDir = resolve(__dirname, 'dist');
      if (!fs.existsSync(distDir)) {
        fs.mkdirSync(distDir, { recursive: true });
      }

      // Copy manifest.json
      const manifestSrc = resolve(__dirname, 'manifest.json');
      if (fs.existsSync(manifestSrc)) {
        fs.copyFileSync(manifestSrc, resolve(distDir, 'manifest.json'));
      }

      // Copy icons
      const iconsSrcDir = resolve(__dirname, 'assets/icons');
      const iconsDistDir = resolve(distDir, 'assets/icons');
      if (fs.existsSync(iconsSrcDir)) {
        fs.mkdirSync(iconsDistDir, { recursive: true });
        for (const file of fs.readdirSync(iconsSrcDir)) {
          fs.copyFileSync(resolve(iconsSrcDir, file), resolve(iconsDistDir, file));
        }
      }

      // Copy content.css
      const contentCssSrc = resolve(__dirname, 'src/content/content.css');
      const contentDistDir = resolve(distDir, 'content');
      if (fs.existsSync(contentCssSrc)) {
        fs.mkdirSync(contentDistDir, { recursive: true });
        fs.copyFileSync(contentCssSrc, resolve(contentDistDir, 'content.css'));
      }

      // Move popup.html and settings.html to expected extension paths
      const popupHtmlSrc = resolve(distDir, 'src/popup/popup.html');
      const popupHtmlDist = resolve(distDir, 'popup/popup.html');
      if (fs.existsSync(popupHtmlSrc)) {
        fs.copyFileSync(popupHtmlSrc, popupHtmlDist);
      }

      const settingsHtmlSrc = resolve(distDir, 'src/options/settings.html');
      const settingsHtmlDist = resolve(distDir, 'options/settings.html');
      if (fs.existsSync(settingsHtmlSrc)) {
        fs.copyFileSync(settingsHtmlSrc, settingsHtmlDist);
      }

      // Remove nested src folder in dist
      const distSrc = resolve(distDir, 'src');
      if (fs.existsSync(distSrc)) {
        fs.rmSync(distSrc, { recursive: true, force: true });
      }

      // Manifest content scripts run as classic scripts: Rollup's shared ESM
      // imports cannot run there. Finalize standalone bundles on every build,
      // including watch rebuilds, rather than only in an npm post-build command.
      await Promise.all([
        ['src/content/content.ts', 'content/content.js'],
        ['src/background/service-worker.ts', 'background/service-worker.js']
      ].map(([entry, output]) => bundleScript({
        entryPoints: [resolve(__dirname, entry)],
        outfile: resolve(distDir, output),
        bundle: true,
        format: 'iife',
        platform: 'browser',
        target: 'es2022',
        sourcemap: process.env.NODE_ENV === 'development'
      })));
    }
  };
}

export default defineConfig({
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: process.env.NODE_ENV === 'development',
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'src/popup/popup.html'),
        settings: resolve(__dirname, 'src/options/settings.html'),
        'service-worker': resolve(__dirname, 'src/background/service-worker.ts'),
        content: resolve(__dirname, 'src/content/content.ts')
      },
      output: {
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'service-worker') {
            return 'background/service-worker.js';
          }
          if (chunkInfo.name === 'content') {
            return 'content/content.js';
          }
          if (chunkInfo.name === 'popup') {
            return 'popup/popup.js';
          }
          if (chunkInfo.name === 'settings') {
            return 'options/settings.js';
          }
          return '[name]/[name].js';
        },
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (assetInfo) => {
          if (assetInfo.name?.endsWith('.css')) {
            if (assetInfo.name.includes('popup')) return 'popup/popup.css';
            if (assetInfo.name.includes('settings')) return 'options/settings.css';
            if (assetInfo.name.includes('content')) return 'content/content.css';
          }
          return 'assets/[name].[ext]';
        }
      }
    }
  },
  plugins: [copyExtensionAssets()]
});
