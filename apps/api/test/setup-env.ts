import { Logger } from '@nestjs/common';
import { applyTestEnv } from './test-env';

applyTestEnv();
// Keep test output readable (services used outside a Nest app log through the static Logger).
if (process.env.LOG_LEVEL === 'silent') Logger.overrideLogger(false);
