import { Logger, type Provider } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { DataCipher } from './crypto';

export const DATA_CIPHER = Symbol('DATA_CIPHER');

/**
 * AES-256-GCM cipher keyed by DATA_ENCRYPTION_KEY. Outside production a missing key is derived from
 * JWT_ACCESS_SECRET (with a warning) so local dev works out of the box; production requires the key.
 */
export const dataCipherProvider: Provider = {
  provide: DATA_CIPHER,
  inject: [ENV],
  useFactory: (env: Env): DataCipher => {
    if (env.DATA_ENCRYPTION_KEY) return new DataCipher(env.DATA_ENCRYPTION_KEY);
    if (env.NODE_ENV === 'production') throw new Error('DATA_ENCRYPTION_KEY is required in production');
    new Logger('DataCipher').warn('DATA_ENCRYPTION_KEY empty — deriving a development key from JWT_ACCESS_SECRET');
    return new DataCipher(createHash('sha256').update(env.JWT_ACCESS_SECRET).digest('base64'));
  },
};
