import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "../e2e",
  use: { baseURL: "http://localhost:5174", trace: "on-first-retry" },
  webServer: [
    {
      command: "cd ../backend && .venv/bin/python manage.py runserver 8001",
      url: "http://localhost:8001/api/health/",
      reuseExistingServer: true,
    },
    {
      command: "npm run dev -- --host 127.0.0.1",
      url: "http://localhost:5174",
      reuseExistingServer: true,
    },
  ],
});
