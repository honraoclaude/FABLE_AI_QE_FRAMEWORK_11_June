import { defineConfig } from '@playwright/test';

// P1 smoke target: full suite under 10 minutes (framework §7.3).
export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  globalTimeout: 10 * 60 * 1000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.QE_BASE_URL ?? 'http://localhost:4100',
    trace: 'retain-on-failure',
  },
  // Dedicated port + AI disabled: e2e runs against its own deterministic
  // server instance even when a dev server with a Claude key is running.
  webServer: {
    command: 'npm run start --workspace=server',
    cwd: '..',
    url: 'http://localhost:4100/api/health',
    reuseExistingServer: false,
    timeout: 60_000,
    env: { PORT: '4100', QE_DB_PATH: 'e2e-portal.db', QE_DISABLE_AI: '1' },
  },
});
