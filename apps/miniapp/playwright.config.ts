import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8080",
      NEXT_PUBLIC_DEV_AUTH_TOKEN:
        process.env.NEXT_PUBLIC_DEV_AUTH_TOKEN ?? "local-development-token"
    }
  },
  projects: [
    {
      name: "mobile-chromium",
      use: {
        ...devices["Pixel 7"],
        channel: process.env.PLAYWRIGHT_CHANNEL === "chrome" ? "chrome" : undefined
      }
    }
  ]
});
