import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { join } from "node:path";

export default defineConfig({
  root: join(__dirname),
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
  build: {
    outDir: join(__dirname, "../dist"),
    emptyOutDir: true,
  },
});
