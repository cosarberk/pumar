import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      // API'ye proxy — web aynı origin'den /api ile konuşur.
      // Port çakışmasında API_PROXY ile override edilebilir (varsayılan :4000).
      "/api": { target: process.env.API_PROXY ?? "http://localhost:4000", changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, "") },
    },
  },
});
