import path from "node:path";
import { defineConfig, lazyPlugins } from "vite-plus";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

// Required for multi-threaded WASM (onnxruntime-web). Must also be set on the
// production host — see docs/architecture.md "Hosting".
const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

// index.html ships the production CSP; in dev, Vite's HMR websocket needs ws:.
const devCsp = () => ({
  name: "leshy:dev-csp",
  apply: "serve" as const,
  transformIndexHtml: (html: string) =>
    html.replaceAll("connect-src 'self'", "connect-src 'self' ws: http:"),
});

export default defineConfig({
  plugins: lazyPlugins(() => [
    svelte(),
    tailwindcss(),
    devCsp(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Leshy",
        short_name: "Leshy",
        description:
          "Scrubs PII out of debugging data before it reaches an LLM. Nothing leaves the woods.",
        theme_color: "#101b15",
        background_color: "#101b15",
        display: "standalone",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,mjs,css,html,svg,png,ico,woff2,wasm}"],
        // ort-wasm artifacts are ~25 MB and essential for offline inference
        maximumFileSizeToCacheInBytes: 40_000_000,
        // model weights are fetched on demand and cached at runtime, never precached
        globIgnores: ["**/models/**"],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith("/models/"),
            handler: "CacheFirst",
            options: {
              cacheName: "leshy-models",
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ]),
  resolve: {
    alias: { $lib: path.resolve("./src/lib") },
  },
  worker: {
    format: "es",
  },
  server: { headers: isolationHeaders },
  preview: { headers: isolationHeaders },
  test: {
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
  },
  fmt: {},
  lint: {
    jsPlugins: [{ name: "vite-plus", specifier: "vite-plus/oxlint-plugin" }],
    rules: { "vite-plus/prefer-vite-plus-imports": "error" },
    options: { typeAware: true, typeCheck: true },
    // generated shadcn-svelte barrels re-export named symbols from .svelte
    // modules, which tsgolint cannot see; svelte-check owns those files.
    // e2e/ + playwright.config.ts import @playwright/test, an intentionally
    // uninstalled dev-only dependency (step 17, adr/0006).
    ignorePatterns: ["src/lib/components/ui/**", "e2e/**", "playwright.config.ts"],
  },
  staged: { "*.{js,ts,svelte,css}": "vp check --fix" },
});
