import { defineConfig } from 'vitest/config';
import path from 'node:path';

// Tests cover pure logic only (no React Native runtime): src/**/*.test.ts
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['src/**/*.test.ts'], environment: 'node' },
});
