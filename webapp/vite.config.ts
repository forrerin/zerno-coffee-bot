import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const api = process.env.VITE_PROXY_API ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  // относительные пути — сборка работает и в корне домена, и в подпапке GitHub Pages
  base: "./",
  server: {
    host: true,
    port: 5173,
    allowedHosts: true, // для туннелей ngrok / cloudflared
    proxy: {
      "/api": api,
      "/media": api,
    },
  },
  build: {
    target: "es2020",
    chunkSizeWarningLimit: 700,
  },
});
