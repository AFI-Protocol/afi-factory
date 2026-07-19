import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot, readJson } from './helpers.js';

/**
 * NON-SKIPPABLE drift guard over the vendored governed schema closure
 * (afi-infra governed-schema discipline):
 *
 *  - the sha256 pins in src/governed-schema/MANIFEST.json are verified on
 *    EVERY run (tamper evidence, no checkout required);
 *  - whenever AFI_CONFIG_DIR points at a checkout of afi-config pinned to
 *    MANIFEST.afiConfigCommit (CI always provides it), every vendored file is
 *    additionally BYTE-COMPARED against its source. A mismatch hard-fails.
 */

const PINNED_COMMIT = 'd6f2504805059ffa09d8c1bfcecb67cd47abcea2';

interface Manifest {
  afiConfigCommit: string;
  sources: Record<string, { afiConfigPath: string; sha256: string }>;
}

const manifest = readJson<Manifest>(join(repoRoot, 'src', 'governed-schema', 'MANIFEST.json'));

function sha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

describe('vendored governed schema closure (MANIFEST integrity)', () => {
  it('pins exactly the authorized afi-config commit', () => {
    expect(manifest.afiConfigCommit).toBe(PINNED_COMMIT);
  });

  it('covers the full contract closure the factory consumes', () => {
    const covered = Object.keys(manifest.sources).sort();
    expect(covered).toEqual(
      [
        'src/governed-schema/pipeline.schema.json',
        'src/governed-schema/pipeline-template.schema.json',
        'src/governed-schema/analysis-plugin.schema.json',
        'src/governed-schema/analyst-strategy-config.schema.json',
        'src/governed-schema/analyst-strategy-registration.schema.json',
        'src/governed-schema/provider-strategy-binding.schema.json',
        'src/governed-schema/composition-ref.schema.json',
        'src/governed-schema/canonical-hash.schema.json',
        'src/governed-schema/canonical-json-hashing.v1.md',
        'src/governed-schema/canonical-json-hashing.kat.json',
      ].sort()
    );
  });

  it('every vendored file matches its recorded sha256 pin (always-on)', () => {
    for (const [vendored, entry] of Object.entries(manifest.sources)) {
      const actual = sha256(readFileSync(join(repoRoot, vendored)));
      expect(actual, `${vendored} drifted from its recorded sha256 pin`).toBe(entry.sha256);
    }
  });

  it('byte-compares against the pinned afi-config checkout when AFI_CONFIG_DIR is provided', () => {
    const dir = process.env.AFI_CONFIG_DIR;
    if (!dir) {
      // Not a skip: the sha256 pins above ALWAYS ran. The byte-equality proof
      // additionally runs whenever a pinned checkout is available (CI always).
      expect(manifest.afiConfigCommit).toBe(PINNED_COMMIT);
      return;
    }
    expect(existsSync(dir), `AFI_CONFIG_DIR '${dir}' does not exist`).toBe(true);
    for (const [vendored, entry] of Object.entries(manifest.sources)) {
      const local = readFileSync(join(repoRoot, vendored));
      const sourcePath = join(dir, entry.afiConfigPath);
      expect(existsSync(sourcePath), `${entry.afiConfigPath} missing in AFI_CONFIG_DIR`).toBe(true);
      const source = readFileSync(sourcePath);
      expect(
        local.equals(source),
        `${vendored} is NOT byte-identical to afi-config@${manifest.afiConfigCommit}:${entry.afiConfigPath}`
      ).toBe(true);
    }
  });
});
