import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './helpers.js';
// @ts-expect-error plain-mjs codegen library (no type declarations by design)
import { generateAll, GENERATED } from '../scripts/codegen-lib.mjs';

/**
 * Codegen freshness: the committed src/generated/ types must be EXACTLY what
 * codegen derives from the vendored governed schemas today. Any schema
 * re-vendoring without `npm run codegen` (or any hand-edit of generated
 * files) fails here.
 */

describe('generated contract types (src/generated/)', () => {
  it('the generated set is exactly the codegen manifest (no extras, no gaps)', () => {
    const expected = Object.values(GENERATED as Record<string, { out: string }>)
      .map((g) => g.out)
      .sort();
    const actual = readdirSync(join(repoRoot, 'src', 'generated'))
      .filter((f) => f.endsWith('.ts'))
      .sort();
    expect(actual).toEqual(expected);
  });

  it('every committed generated file is byte-identical to a fresh generation', async () => {
    const fresh: Record<string, string> = await generateAll();
    for (const [outFile, content] of Object.entries(fresh)) {
      const committed = readFileSync(join(repoRoot, 'src', 'generated', outFile), 'utf-8');
      expect(committed, `src/generated/${outFile} is stale — run npm run codegen`).toBe(content);
    }
  });
});
