import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Whisper — Encrypted Chat",
        short_name: "Whisper",
        description: "E2E encrypted chat & video calls",
        theme_color: "#1a1a2e",
        background_color: "#1a1a2e",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\/api\//,
            handler: "NetworkFirst",
            options: { cacheName: "api-cache", expiration: { maxEntries: 50 } },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: { "/api": "http://localhost:3000", "/ws": { target: "ws://localhost:3000", ws: true } },
  },
});
