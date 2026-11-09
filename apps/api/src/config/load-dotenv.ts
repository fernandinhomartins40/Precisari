import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config } from 'dotenv';

/**
 * Loads `apps/api/.env` without overriding variables already present in the environment.
 * Works from src/ (ts-node), dist/ (node) and other working directories (e.g. apps/worker).
 */
export function loadDotenv(): void {
  const candidates = [resolve(process.cwd(), '.env'), resolve(__dirname, '..', '..', '.env')];
  for (const path of candidates) {
    if (existsSync(path)) {
      config({ path, quiet: true });
      return;
    }
  }
}
