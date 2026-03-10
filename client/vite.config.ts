import { defineConfig } from "vite";
import solid from "vite-plugin-solid";

import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    solid(),
    VitePWA({
      devOptions: { enabled: true },
      registerType: "autoUpdate",
      manifest: {
        name: "Whisper — Encrypted Chat",
        short_name: "Whisper",
        description: "E2E encrypted chat & video calls",
        theme_color: "#f5f6fa",
        background_color: "#f5f6fa",
        display: "standalone",
        icons: [
          { src: "icon-192.svg", sizes: "192x192", type: "image/svg+xml" },
          { src: "icon-512.svg", sizes: "512x512", type: "image/svg+xml" },
        ],
      },
      workbox: {
        importScripts: ["/sw-custom.js"],
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
    allowedHosts: true,
    proxy: {
      "/api": "http://localhost:3000",
      "/ws": { target: "http://localhost:3000", ws: true, rewriteWsOrigin: true },
    },
  },
});
