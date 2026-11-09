import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildCssVariables } from './css';

writeFileSync(join(__dirname, 'tokens.css'), buildCssVariables());
