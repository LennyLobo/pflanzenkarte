import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// base './' so the app also runs from a sub-path (GitHub Pages).
export default defineConfig({
  base: './',
  server: { port: 5180 },
  preview: { port: 5181 },
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon.svg'],
      manifest: {
        name: 'PflanzenKarte',
        short_name: 'PflanzenKarte',
        description: 'Pflanzenfunde mit Foto und GPS auf dem Luftbild erfassen',
        lang: 'de',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#f4f1ea',
        theme_color: '#2f5d3a',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell only. Aerial tiles come live from the LGLN service.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
});
