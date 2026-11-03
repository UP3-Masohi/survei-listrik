import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Survei Calon Pelanggan Listrik',
        short_name: 'Survei Listrik',
        lang: 'id',
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#0b5ed7',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        runtimeCaching: [{
          urlPattern: /^https:\/\/[abc]\.tile\.openstreetmap\.org\/.*/i,
          handler: 'CacheFirst',
          options: {
            cacheName: 'tile-peta',
            expiration: { maxEntries: 1000, maxAgeSeconds: 30 * 24 * 3600 }
          }
        }]
      }
    })
  ]
})
