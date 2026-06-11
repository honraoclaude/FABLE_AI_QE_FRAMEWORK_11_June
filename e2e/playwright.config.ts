import { defineConfig } from '@playwright/test';

// P1 smoke target: full suite under 10 minutes (framework §7.3).
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  globalTimeout: 10 * 60 * 1000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.QE_BASE_URL ?? 'http://localhost:4000',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'npm run start --workspace=server',
    cwd: '..',
    url: 'http://localhost:4000/api/health',
    reuseExistingServer: true,
    timeout: 60_000,
    env: { QE_DB_PATH: 'e2e-portal.db' },
  },
});
