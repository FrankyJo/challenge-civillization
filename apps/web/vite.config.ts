import vue from "@vitejs/plugin-vue";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, "../..", "");
  // The browser talks to same-origin `/api`; dev/preview proxy it to the API
  // process so no CORS surface is opened on the API.
  const apiTarget = env["API_BASE_URL"] ?? "http://127.0.0.1:3000";
  const proxy = {
    "/api": { target: apiTarget, changeOrigin: true, rewrite: (path: string) => path.replace(/^\/api/, "") },
  };
  return {
    plugins: [vue()],
    envDir: "../..",
    server: { port: Number(env["WEB_PORT"] ?? 5173), strictPort: true, proxy },
    preview: { port: Number(env["WEB_PREVIEW_PORT"] ?? 4173), strictPort: true, proxy },
    build: { target: "es2022", sourcemap: true, chunkSizeWarningLimit: 2000 },
  };
});
