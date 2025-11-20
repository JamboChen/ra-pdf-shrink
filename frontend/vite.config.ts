import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";

// https://vite.dev/config/
export default defineConfig({
  worker: {
    format: "es",
  },
  optimizeDeps: {
    exclude: ["ra_pdf"],
  },
  assetsInclude: ["**/*.wasm"],
  server: {
    headers: {
      // 确保 WASM 可以被缓存
      "Cache-Control": "public, max-age=31536000",
    },
  },
  plugins: [react(), wasm(), topLevelAwait(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  base: "/ra-pdf-shrink/",
});
