import { defineConfig, devices } from "@playwright/test";

// Optional end-to-end smoke test (implementation-plan.md step 17). Playwright is
// intentionally NOT a dependency (the build's no-new-deps rule, adr/0006), so
// running this requires: `npm i -D @playwright/test && npx playwright install`.
// Then: `npm run test:e2e` (or `vp run test:e2e`).
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:4173" },
  // Serves the production build (with COOP/COEP + strict CSP) so the worker,
  // wasm and model all come from the same origin, exactly like production.
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4173",
    timeout: 120_000,
    reuseExistingServer: true,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
