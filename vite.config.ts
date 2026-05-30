// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // Force nitro on for Cloudflare builds outside the Lovable sandbox (e.g.
  // Cloudflare's GitHub-based build pipeline). Without this the plugin
  // auto-detects "no Lovable context" and skips the nitro deploy bundle,
  // leaving only `dist/` (plain Vite output) and no Worker entry for wrangler.
  // With `nitro: true`, the build emits `dist/server/server.js` (Worker entry)
  // and `dist/client/` (static assets) — wrangler.toml points at those.
  nitro: true,
});
