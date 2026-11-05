import { defineConfig } from '@playwright/test';
import chromium from '@sparticuz/chromium';
process.env.E2E_DATA_DIR ||= '.data/e2e-' + Date.now();
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  use: {
    baseURL: 'http://localhost:3100',
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || (await chromium.executablePath()),
      args: chromium.args.filter((a) => a !== '--single-process'),
    },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `NODE_ENV=test SERVE_BUILD=1 DATA_DIR=${process.env.E2E_DATA_DIR} PORT=3100 APP_URL=http://localhost:3100 node --import tsx server/index.ts`,
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: false,
    timeout: 90000,
  },
  reporter: 'list',
});
