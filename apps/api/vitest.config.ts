import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC plugin keeps decorator metadata for NestJS DI in tests.
// Integration tests share one Postgres database, hence no file parallelism.
export default defineConfig({
  test: {
    globals: false,
    include: ['src/**/*.spec.ts', 'test/**/*.spec.ts'],
    setupFiles: ['test/setup-env.ts'],
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
