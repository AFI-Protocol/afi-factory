import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { repoRoot, readJson } from './helpers.js';

/**
 * No-dangling-references guard: every repo-relative path referenced by a
 * manifest, registry artifact, package manifest, codex descriptor, or doc
 * must exist in the tree.
 */

function mustExist(path: string, referencedBy: string): void {
  expect(existsSync(path), `'${path}' referenced by ${referencedBy} does not exist`).toBe(true);
}

describe('no dangling references', () => {
  it('package.json files/bin/exports resolve', () => {
    const pkg = readJson<any>(join(repoRoot, 'package.json'));
    for (const entry of pkg.files) {
      // dist/ is a build output (gitignored) — the files list ships it, and
      // the build ran before tests (pretest). Everything else must be in-tree.
      mustExist(join(repoRoot, entry), 'package.json files[]');
    }
    for (const bin of Object.values<string>(pkg.bin)) mustExist(join(repoRoot, bin), 'package.json bin');
    const walkExports = (v: unknown): void => {
      if (typeof v === 'string') mustExist(join(repoRoot, v), 'package.json exports');
      else if (v && typeof v === 'object') Object.values(v).forEach(walkExports);
    };
    walkExports(pkg.exports);
  });

  it('.afi-codex.json entrypoints resolve', () => {
    const codex = readJson<any>(join(repoRoot, '.afi-codex.json'));
    for (const entry of codex.entrypoints) mustExist(join(repoRoot, entry), '.afi-codex.json entrypoints');
  });

  it('governed-schema MANIFEST source keys resolve', () => {
    const manifest = readJson<any>(join(repoRoot, 'src', 'governed-schema', 'MANIFEST.json'));
    for (const vendored of Object.keys(manifest.sources)) mustExist(join(repoRoot, vendored), 'MANIFEST.json sources');
  });

  it('official hashes.json artifact paths resolve', () => {
    const hashes = readJson<any>(join(repoRoot, 'templates', 'official', 'froggy-trend-pullback', 'hashes.json'));
    for (const p of Object.values<string>(hashes.artifacts)) mustExist(join(repoRoot, p), 'hashes.json artifacts');
  });

  it('every relative markdown link in README/AGENTS/docs resolves', () => {
    const mdFiles: string[] = [join(repoRoot, 'README.md'), join(repoRoot, 'AGENTS.md')];
    const docsDir = join(repoRoot, 'docs');
    const collect = (dir: string) => {
      for (const f of readdirSync(dir)) {
        const full = join(dir, f);
        if (statSync(full).isDirectory()) collect(full);
        else if (f.endsWith('.md')) mdFiles.push(full);
      }
    };
    if (existsSync(docsDir)) collect(docsDir);
    const linkRe = /\[[^\]]*\]\(([^)\s]+)\)/g;
    for (const md of mdFiles) {
      const text = readFileSync(md, 'utf-8');
      for (const match of text.matchAll(linkRe)) {
        const target = match[1];
        if (/^(https?:|mailto:|#)/.test(target)) continue;
        const clean = target.split('#')[0];
        if (!clean) continue;
        mustExist(resolve(dirname(md), clean), md.slice(repoRoot.length));
      }
    }
  });
});
