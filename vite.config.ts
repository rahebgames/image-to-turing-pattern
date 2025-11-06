import { defineConfig } from "vite";

export default defineConfig({
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
