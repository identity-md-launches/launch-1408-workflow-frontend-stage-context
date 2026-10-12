import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: { react: ["react", "react-dom"], ethereum: ["viem"] },
      },
    },
  },
  test: { include: ["tests/**/*.test.ts"] },
});
