/**
 * Writes the generated contract types (src/generated/) from the vendored
 * governed schemas. See scripts/codegen-lib.mjs.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { generateAll } from './codegen-lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, '..', 'src', 'generated');
mkdirSync(outDir, { recursive: true });

const files = await generateAll();
for (const [name, content] of Object.entries(files)) {
  writeFileSync(join(outDir, name), content);
  console.log(`generated src/generated/${name}`);
}
