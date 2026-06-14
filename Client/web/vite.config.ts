import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { fileURLToPath } from "url";
import { visualizer } from "rollup-plugin-visualizer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: "dist/stats.html",
      gzipSize: true,
      brotliSize: true,
      open: false,
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
      "/ws": {
        target: "ws://localhost:8080",
        ws: true,
      },
    },
  },
  optimizeDeps: {
    // include highlight.js/lib/core so esbuild converts CJS module.exports
    // to ESM named+default exports. lowlight and rehype-highlight excluded —
    // lowlight resolves via package exports (works with highlight.js direct dep),
    // rehype-highlight is too large (200+ lang files) for esbuild.
    include: ["highlight.js/lib/core"],
    exclude: ["rehype-highlight"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          motion: ["framer-motion"],
          markdown: ["react-markdown", "remark-gfm", "rehype-highlight"],
          xterm: ["xterm", "@xterm/addon-fit"],
        },
      },
    },
  },
});
