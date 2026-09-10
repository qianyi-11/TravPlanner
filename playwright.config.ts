import { defineConfig } from "@playwright/test";

const demoPort = 3100;
const demoBaseUrl = `http://localhost:${demoPort}`;

export default defineConfig({
  testDir: "./demo",
  testMatch: "travplanner-demo.spec.ts",
  timeout: 8 * 60 * 1000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["line"]],
  outputDir: "test-results/demo",
  use: {
    baseURL: demoBaseUrl,
    headless: true,
    viewport: { width: 1440, height: 900 },
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
    launchOptions: { slowMo: 300 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: process.env.DEMO_RECORD === "1" ? "on" : "off",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `npm run dev -- -p ${demoPort}`,
    url: demoBaseUrl,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
