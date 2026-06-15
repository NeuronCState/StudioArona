import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from "url";
import { defineConfig, type Plugin } from "vite";
import { visualizer } from "rollup-plugin-visualizer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * devbypass-mock: 拦截 /api/* 返回 mock 数据, 让 puppeteer 截图绕过 api-gateway 401/500
 * 用法: 访问 http://127.0.0.1:5173/?devbypass=1
 * 触发: 任何带 devbypass=1 的请求都被 mock
 */
function devBypassMockPlugin(): Plugin {
  return {
    name: "devbypass-mock",
    configureServer(server) {
      server.middlewares.use("/api", (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        const fullUrl = req.headers.referer ?? "";
        const isDevBypass = fullUrl.includes("devbypass=1") || url.searchParams.get("devbypass") === "1";
        if (!isDevBypass) return next();

        // Mock 数据
        const mock = (data: unknown) => {
          res.setHeader("Content-Type", "application/json");
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.statusCode = 200;
          res.end(JSON.stringify(data));
        };

        if (url.pathname.includes("/schedules")) {
          return mock([
            { id: "s1", title: "团队周会", start_at: "2026-06-16T10:00:00Z", end_at: "2026-06-16T11:00:00Z", location: "会议室 A" },
            { id: "s2", title: "项目评审", start_at: "2026-06-17T14:00:00Z", end_at: "2026-06-17T15:30:00Z", location: "线上" },
            { id: "s3", title: "客户演示", start_at: "2026-06-18T09:30:00Z", end_at: "2026-06-18T10:30:00Z", location: "演示厅" },
          ]);
        }
        if (url.pathname.includes("/feeds")) {
          return mock([
            { id: "f1", title: "Test Feed", source: "rss.test", updated_at: Date.now() - 86_400_000 },
            { id: "f2", title: "HN RSS", source: "news.ycombinator.com", updated_at: Date.now() - 4 * 86_400_000 },
            { id: "f3", title: "少数派", source: "sspai.com", updated_at: Date.now() - 4 * 86_400_000 },
            { id: "f4", title: "IT之家 RSS", source: "ithome.com", updated_at: Date.now() - 4 * 86_400_000 },
          ]);
        }
        if (url.pathname.includes("/vms")) {
          return mock([
            { id: "v1", name: "dev-box-01", host: "10.0.0.11", status: "running" },
            { id: "v2", name: "staging-k8s", host: "10.0.0.12", status: "stopped" },
            { id: "v3", name: "ci-runner", host: "10.0.0.13", status: "running" },
          ]);
        }
        if (url.pathname.includes("/weather")) {
          return mock({
            city: "上海",
            temperature: 24,
            condition: "多云",
            humidity: 65,
            windSpeed: 17,
            windDirection: "S",
            feelsLike: 23,
            uvIndex: 5,
          });
        }
        if (url.pathname.includes("/system")) {
          return mock({
            cpu: 42, memory: 67, disk: 51, network_in: 120, network_out: 80,
          });
        }
        // Default: empty array
        return mock([]);
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    devBypassMockPlugin(),
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
        configure: (proxy) => {
          proxy.on('error', () => { /* swallow, mock middleware handles */ });
        },
        bypass: (req) => {
          // devbypass 模式: 全部 /api 返回 mock, 不走 api-gateway
          if (req.url?.includes('devbypass=1')) return req.url;
          return null;
        },
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
