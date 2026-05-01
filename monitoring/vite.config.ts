import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 4173,
    proxy: {
      "/ports.json": "http://127.0.0.1:4174",
      "/stop-port": "http://127.0.0.1:4174",
      "/stop-dashboard": "http://127.0.0.1:4174",
      "/ask-codex": "http://127.0.0.1:4174",
    },
  },
});
