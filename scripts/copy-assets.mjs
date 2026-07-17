/**
 * Copies non-TypeScript runtime assets into dist/ after tsc:
 * the vendored governed schema closure (JSON + KATs) the library loads at
 * runtime via `new URL('./governed-schema/...', import.meta.url)`.
 */
import { cpSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
cpSync(join(root, 'src', 'governed-schema'), join(root, 'dist', 'governed-schema'), {
  recursive: true,
});
console.log('copied src/governed-schema -> dist/governed-schema');
