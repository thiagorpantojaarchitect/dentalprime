/// <reference types="vitest/config" />
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const serviceProxies = {
  "/api/identity": "http://127.0.0.1:3001",
  "/api/patients": "http://127.0.0.1:3002",
  "/api/scheduling": "http://127.0.0.1:3003",
  "/api/treatment": "http://127.0.0.1:3004",
  "/api/finance": "http://127.0.0.1:3005",
  "/api/crm": "http://127.0.0.1:3006",
  "/api/ai": "http://127.0.0.1:3007",
} as const;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      Object.entries(serviceProxies).map(([prefix, target]) => [
        prefix,
        {
          target,
          changeOrigin: true,
          rewrite: (path: string) => path.slice(prefix.length) || "/",
        },
      ]),
    ),
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
