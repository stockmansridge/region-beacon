// Test-only config: plain React + "@" alias. Kept separate from the app's
// Vite/TanStack config so mounted DOM tests get a single client React build.
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) }, dedupe: ["react", "react-dom"] },
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
