import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/** Directory of the API package whose compiled `dist/worker.js` is the worker entrypoint. */
export const API_DIR = resolve(__dirname, '..', '..', 'api');

/** Absolute path of the compiled worker entrypoint (build it with `pnpm --filter api build`). */
export function apiWorkerEntry(): string {
  return resolve(API_DIR, 'dist', 'worker.js');
}

/** The API's `start:worker` script — the command `pnpm --filter worker start` delegates to. */
export function apiWorkerScript(): string | undefined {
  const pkg = JSON.parse(readFileSync(resolve(API_DIR, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
  return pkg.scripts?.['start:worker'];
}
