import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadEnv({ path: '.env.local' });

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.integration.test.ts'],
    globalSetup: ['./vitest.integration.global-setup.ts'],
    fileParallelism: false,
    env: {
      TEST_DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
      DATABASE_URL: process.env.DATABASE_URL ?? '',
    },
  },
});
