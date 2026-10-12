import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  timeout: 45000,
  expect: { timeout: 12000 },
  workers: 1,
  reporter: [
    ["list"],
    ["json", { outputFile: "../docs/evidence/browser-results.json" }],
  ],
  outputDir: "../test/scratch/playwright-results",
  use: {
    baseURL: "http://127.0.0.1:4173/preview/",
    headless: true,
    viewport: { width: 1440, height: 1050 },
    launchOptions: {
      executablePath:
        process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ||
        (existsSync(
          "/opt/imd-tools/ms-playwright/chromium-1246/chrome-linux64/chrome",
        )
          ? "/opt/imd-tools/ms-playwright/chromium-1246/chrome-linux64/chrome"
          : undefined),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "node scripts/serve.mjs",
    url: "http://127.0.0.1:4173/preview/",
    reuseExistingServer: false,
    timeout: 10000,
  },
});
