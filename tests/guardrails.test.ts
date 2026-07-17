import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './helpers.js';

/**
 * Cross-cutting guardrails (Section 14.8): the capability catalog must stay
 * generated from handlers (never a hand-maintained manifest file), and no
 * Factory source may reintroduce the removed afi-skills repository.
 */

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git'].includes(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

describe('guardrails', () => {
  it('no committed static capability-catalog manifest (the catalog is generated from the registry)', () => {
    const staticCatalogs = walk(join(repoRoot, 'src'))
      .concat(walk(join(repoRoot, 'templates')))
      .filter((f) => f.endsWith('.json') && /(^|\/)(capabilit|catalog|skills?)[^/]*\.json$/i.test(f));
    expect(staticCatalogs).toEqual([]);
  });

  it('no Factory source or top-level doc reintroduces afi-skills', () => {
    const targets = walk(join(repoRoot, 'src'));
    for (const doc of ['README.md', 'AGENTS.md']) {
      const p = join(repoRoot, doc);
      if (existsSync(p)) targets.push(p);
    }
    for (const f of targets) {
      expect(readFileSync(f, 'utf8').toLowerCase().includes('afi-skills'), `${f} must not reference afi-skills`).toBe(false);
    }
  });
});
