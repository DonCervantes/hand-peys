import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  use: { baseURL: "http://localhost:8787", trace: "retain-on-failure" },
  webServer: {
    // API + web en un solo Worker, modo demo (sin contratos ni Pollar).
    command: "pnpm --filter @hand-peys/api exec wrangler d1 migrations apply hand-peys-db --local && pnpm --filter @hand-peys/api exec wrangler dev --port 8787",
    url: "http://localhost:8787/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
