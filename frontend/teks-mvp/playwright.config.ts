import { defineConfig } from '@playwright/test';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PLAYWRIGHT_PORT || process.env.PORT || 4200);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:4200',
    trace: 'on-first-retry',
    screenshot: 'on'
  },
  webServer: [
    {
      command: 'npm start -- --port 4200',
      url: 'http://localhost:4200',
      reuseExistingServer: !process.env.CI,
      timeout: 180000,
      cwd: '.',
      stdout: 'pipe',
      stderr: 'pipe'
    }
  ]
});
