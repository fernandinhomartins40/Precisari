import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { testDatabaseUrl } from './test-env';

/** Applies migrations to the test database once per run (creates it if missing; no-op when up to date). */
export default function setup(): void {
  execSync('pnpm exec prisma migrate deploy', {
    cwd: resolve(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    stdio: 'pipe',
  });
}
