import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true,
  },
  build: {
    outDir: "dist",
  },
  define: {
    "import.meta.env": JSON.stringify({ VITE_SERVER_URL: "http://localhost:3000" }),
  },
});

