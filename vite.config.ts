import { defineConfig } from "vite";

export default defineConfig({
  base: '/image-to-turing-pattern/',
  root: "src",
  publicDir: "../public",
  build: {
    outDir: "../dist",
  },
  resolve: {
    dedupe: ["regl"],
    conditions: ["import", "default"],
  },
  optimizeDeps: {
    esbuildOptions: {
      conditions: ["browser", "import", "default"],
    },
  },
});
