import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "."),
  plugins: [react()],
  base: "/5k-command-center/",
  build: {
    outDir: resolve(__dirname, "../github-pages-dist"),
    emptyOutDir: true,
  },
});
