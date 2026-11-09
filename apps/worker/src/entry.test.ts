import { describe, expect, it } from 'vitest';
import { apiWorkerEntry, apiWorkerScript } from './entry';

describe('worker entrypoint', () => {
  it('delegates to the api worker build output', () => {
    expect(apiWorkerEntry()).toMatch(/apps[\\/]api[\\/]dist[\\/]worker\.js$/);
    expect(apiWorkerScript()).toBe('node dist/worker.js');
  });
});
