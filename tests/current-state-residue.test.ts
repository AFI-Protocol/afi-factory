import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';
import { repoRoot, readJson } from './helpers.js';

/**
 * Current-state residue guards (Mission F0): the active tree teaches ONLY the
 * current AFI architecture. One canonical afi-config pin; no superseded
 * evidence-contract identifiers; no retired terminology; no second evidence
 * authority. Vendored canonical bytes (src/governed-schema/) are governed by
 * the byte-pin drift test, and src/generated/ is their mechanical projection —
 * both are therefore excluded from the Factory-authored-text scans below.
 */

const EXCLUDED_DIRS = new Set(['node_modules', 'dist', '.git', '.logs']);
const CANONICAL_EXCLUDED = ['src/governed-schema', 'src/generated'];

function walk(dir: string, acc: string[] = []): string[] {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

function factoryAuthoredFiles(): string[] {
  const self = join(repoRoot, 'tests', 'current-state-residue.test.ts');
  return walk(repoRoot).filter((f) => {
    const rel = relative(repoRoot, f);
    if (f === self) return false; // this guard names the banned tokens
    if (rel === 'package-lock.json') return false; // npm-generated
    if (CANONICAL_EXCLUDED.some((d) => rel.startsWith(d))) return false;
    return /\.(ts|mts|mjs|js|json|md|yml|yaml)$/.test(rel);
  });
}

describe('current-state residue guards', () => {
  it('ONE canonical afi-config pin everywhere (closure MANIFEST, official hashes, drift test, CI checkout)', () => {
    const closure = readJson<any>(join(repoRoot, 'src', 'governed-schema', 'MANIFEST.json'));
    const pin = closure.afiConfigCommit;
    expect(pin).toMatch(/^[0-9a-f]{40}$/);

    const hashes = readJson<any>(join(repoRoot, 'official', 'froggy-trend-pullback', 'hashes.json'));
    expect(hashes.afiConfigCommit, 'official hashes.json pin').toBe(pin);

    const driftTest = readFileSync(join(repoRoot, 'tests', 'governed-schema-drift.test.ts'), 'utf-8');
    expect(driftTest, 'drift-test PINNED_COMMIT').toContain(`'${pin}'`);

    const ci = readFileSync(join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf-8');
    const refs = [...ci.matchAll(/ref:\s*([0-9a-f]{40})/g)].map((m) => m[1]);
    expect(refs, 'CI pinned afi-config checkout').toEqual([pin]);

    // No other commit pin — full or shorthand — may appear in Factory-authored
    // text: every 40-hex string must BE the pin, and every afi-config@<sha>
    // reference must be a prefix of it.
    for (const f of factoryAuthoredFiles()) {
      const content = readFileSync(f, 'utf-8');
      const rel = relative(repoRoot, f);
      for (const m of content.matchAll(/\b[0-9a-f]{40}\b/g)) {
        expect(m[0], `stray commit pin in ${rel}`).toBe(pin);
      }
      for (const m of content.matchAll(/afi-config@([0-9a-f]{7,40})\b/g)) {
        expect(pin.startsWith(m[1]), `stray shorthand afi-config pin '${m[1]}' in ${rel}`).toBe(true);
      }
    }
  });

  it('no superseded evidence-contract identifier appears in Factory-authored text', () => {
    // Constructed so this guard's own source (excluded anyway) stays greppable.
    const banned = [/scored-signal-evidence\.v[12]\b/, /\bEvidenceV[12]\b/, /\bevidence\.v[12]\b/i];
    for (const f of factoryAuthoredFiles()) {
      const content = readFileSync(f, 'utf-8');
      for (const re of banned) {
        expect(re.test(content), `${relative(repoRoot, f)} matches ${re}`).toBe(false);
      }
    }
  });

  it('no retired terminology returns (Pipeheads, generic DAG runtime, social category)', () => {
    for (const f of factoryAuthoredFiles()) {
      const content = readFileSync(f, 'utf-8');
      const rel = relative(repoRoot, f);
      expect(/pipehead/i.test(content), `${rel} mentions Pipeheads`).toBe(false);
      expect(content.includes('src/dag'), `${rel} mentions a generic DAG runtime home`).toBe(false);
      // 'social' may appear ONLY as a rejected value in negative tests.
      if (!rel.startsWith('tests/')) {
        expect(/['"]social['"]/.test(content), `${rel} names 'social' as a category`).toBe(false);
      }
    }
    // The governed category vocabulary itself has exactly the seven categories.
    const schema = readJson<any>(join(repoRoot, 'src', 'governed-schema', 'pipeline.schema.json'));
    const categories = schema.definitions.node.properties.category.enum;
    expect(categories).toEqual(['technical', 'pattern', 'sentiment', 'news', 'aiMl', 'merge', 'scorer']);
  });

  it('Factory holds no evidence builder, evidence hasher, or persistence surface', () => {
    // No store/driver dependency; the dependency set is exactly the authoring tooling.
    const pkg = readJson<any>(join(repoRoot, 'package.json'));
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['ajv', 'ajv-formats', 'commander']);
    // No Factory source names the evidence-record hash surfaces or a store.
    const srcFiles = factoryAuthoredFiles().filter((f) => relative(repoRoot, f).startsWith('src/'));
    for (const f of srcFiles) {
      const content = readFileSync(f, 'utf-8');
      const rel = relative(repoRoot, f);
      for (const token of ['recordHash', 'replayHash', 'providerInvocations', 'mongodb', 'mongoose']) {
        expect(content.includes(token), `${rel} contains '${token}'`).toBe(false);
      }
    }
  });

  it('the official composition is manifest-authored: no template claims official identity', () => {
    // The provider-backed official composition cannot be expressed by the
    // values-only afi.pipeline-template.v1 contract; official/ carries the
    // canonical registry records directly.
    expect(existsSync(join(repoRoot, 'templates')), 'templates/ directory returned').toBe(false);
    const officialRoot = join(repoRoot, 'official');
    for (const dir of readdirSync(officialRoot)) {
      const files = readdirSync(join(officialRoot, dir));
      expect(files, `official/${dir} must not carry a template`).not.toContain('template.json');
      for (const required of ['pipeline.manifest.json', 'analyst-config.json', 'hashes.json', 'plugins']) {
        expect(files, `official/${dir} missing ${required}`).toContain(required);
      }
    }
  });
});
