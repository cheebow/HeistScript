import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  fullyParallel: false,
  retries: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    viewport: { width: 1400, height: 900 },
    trace: 'retain-on-failure',
  },
  // devices プリセットは UA を上書きし Monaco の修飾キー判定 (Ctrl/Cmd) がホストとずれるため使わない
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: 'npm run build -- --logLevel silent >/dev/null 2>&1; npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
