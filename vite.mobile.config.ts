import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  base: "./",
  root: resolve(import.meta.dirname, "mobile"),
  plugins: [react()],
  build: {
    outDir: resolve(import.meta.dirname, "mobile-dist"),
    emptyOutDir: true,
  },
});
