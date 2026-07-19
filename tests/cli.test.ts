import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot, officialDir, conformanceDir, readJson, proofTemplate, clone } from './helpers.js';
import { validateDocument } from '../src/index.js';

/**
 * CLI behaviour, exercised against the BUILT binary (dist/cli/index.js, wired
 * as the package bin): nonzero exit on invalid input, --json machine output,
 * JSON-pointer error paths, hash stability across runs, and honest validation
 * (never 'valid: true' without executing real validation).
 */

const cliPath = join(repoRoot, 'dist', 'cli', 'index.js');
const manifestPath = join(officialDir, 'pipeline.manifest.json');
const analystConfigPath = join(officialDir, 'analyst-config.json');
const pluginsDir = join(officialDir, 'plugins');
const hashes = readJson<any>(join(officialDir, 'hashes.json'));

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

function cli(args: string[]): CliResult {
  try {
    const stdout = execFileSync(process.execPath, [cliPath, ...args], { encoding: 'utf-8' });
    return { status: 0, stdout, stderr: '' };
  } catch (e: any) {
    return { status: e.status ?? 1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

function tmp(): string {
  return mkdtempSync(join(tmpdir(), 'afi-factory-cli-'));
}

beforeAll(() => {
  expect(existsSync(cliPath), 'dist/cli/index.js missing — run npm run build (pretest does)').toBe(true);
});

describe('pipeline validate', () => {
  it('valid manifest + plugin set -> exit 0', () => {
    const r = cli(['pipeline', 'validate', manifestPath, '--plugins', pluginsDir]);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('VALID pipeline');
  });

  it('--json emits machine-readable {valid:true}', () => {
    const r = cli(['pipeline', 'validate', manifestPath, '--plugins', pluginsDir, '--json']);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.valid).toBe(true);
    expect(parsed.kind).toBe('pipeline');
    expect(parsed.errors).toEqual([]);
  });

  it('invalid manifest -> nonzero exit with JSON-pointer errors', () => {
    const dir = tmp();
    const bad = clone(readJson<any>(manifestPath));
    bad.nodes[0].category = 'social';
    const file = join(dir, 'bad.json');
    writeFileSync(file, JSON.stringify(bad));
    const r = cli(['pipeline', 'validate', file]);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('/nodes/0/category');
    const rj = cli(['pipeline', 'validate', file, '--json']);
    expect(rj.status).not.toBe(0);
    const parsed = JSON.parse(rj.stdout);
    expect(parsed.valid).toBe(false);
    expect(parsed.errors.some((e: any) => e.pointer === '/nodes/0/category')).toBe(true);
  });

  it('graph-invalid manifest (cycle) -> nonzero exit', () => {
    const dir = tmp();
    const bad = clone(readJson<any>(manifestPath));
    bad.edges.push({ from: 'scorer', to: 'technical' });
    const file = join(dir, 'cycle.json');
    writeFileSync(file, JSON.stringify(bad));
    const r = cli(['pipeline', 'validate', file, '--json']);
    expect(r.status).not.toBe(0);
    expect(JSON.parse(r.stdout).valid).toBe(false);
  });

  it('unparseable JSON -> nonzero exit', () => {
    const dir = tmp();
    const file = join(dir, 'broken.json');
    writeFileSync(file, '{not json');
    const r = cli(['pipeline', 'validate', file]);
    expect(r.status).not.toBe(0);
  });
});

describe('pipeline inspect', () => {
  it('renders waves and node table (text + --json agree)', () => {
    const text = cli(['pipeline', 'inspect', manifestPath]);
    expect(text.status).toBe(0);
    expect(text.stdout).toContain('wave 1: pattern, sentiment, news');
    const json = cli(['pipeline', 'inspect', manifestPath, '--json']);
    expect(json.status).toBe(0);
    const parsed = JSON.parse(json.stdout);
    expect(parsed.waves[1]).toEqual(['pattern', 'sentiment', 'news']);
    expect(parsed.executionOrder[6]).toBe('scorer');
  });
});

describe('template validate / instantiate', () => {
  function writtenTemplate(mutate?: (t: any) => void): string {
    const t = proofTemplate();
    mutate?.(t);
    const file = join(tmp(), 'template.json');
    writeFileSync(file, JSON.stringify(t, null, 2));
    return file;
  }

  it('the proof template validates', () => {
    const r = cli(['template', 'validate', writtenTemplate(), '--json']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).valid).toBe(true);
  });

  it('instantiate with defaults emits an admissible manifest with a stable canonical hash', () => {
    const dir = tmp();
    const out = join(dir, 'out.json');
    const file = writtenTemplate();
    const r = cli(['template', 'instantiate', file, '--plugins', pluginsDir, '--out', out]);
    expect(r.status).toBe(0);
    const manifest = JSON.parse(readFileSync(out, 'utf-8'));
    expect(manifest.schema).toBe('afi.pipeline.v1');
    expect(manifest.nodes[0].config).toEqual({ candleLimit: 100 });
    const again = cli(['template', 'instantiate', file, '--plugins', pluginsDir, '--json']);
    expect(r.stdout).toContain(JSON.parse(again.stdout).manifestHash.value);
  });

  it('instantiate with -p overrides applies validated values', () => {
    const file = writtenTemplate();
    const defaults = cli(['template', 'instantiate', file, '--json']);
    const r = cli(['template', 'instantiate', file, '-p', 'candleLimit=250', '--json']);
    expect(r.status).toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.valid).toBe(true);
    expect(parsed.pipeline.nodes[0].config.candleLimit).toBe(250);
    expect(parsed.manifestHash.value).not.toBe(JSON.parse(defaults.stdout).manifestHash.value);
  });

  it('instantiate fails closed on a missing required parameter', () => {
    const file = writtenTemplate((t) => {
      t.parameters[0].required = true;
      delete t.parameters[0].default;
    });
    const r = cli(['template', 'instantiate', file, '--json']);
    expect(r.status).not.toBe(0);
    expect(JSON.parse(r.stdout).valid).toBe(false);
  });

  it('instantiate fails closed on an ill-typed parameter value', () => {
    const r = cli(['template', 'instantiate', writtenTemplate(), '-p', 'candleLimit=0']);
    expect(r.status).not.toBe(0);
  });
});

describe('analyst-config', () => {
  it('official analyst-config cross-validates against the manifest', () => {
    const r = cli([
      'analyst-config', 'validate', analystConfigPath,
      '--pipeline', manifestPath, '--plugins', pluginsDir, '--json',
    ]);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout).valid).toBe(true);
  });

  it('a tampered manifestHash pin fails closed', () => {
    const dir = tmp();
    const bad = clone(readJson<any>(analystConfigPath));
    bad.pipelineRef.manifestHash.value = 'f'.repeat(64);
    const file = join(dir, 'config.json');
    writeFileSync(file, JSON.stringify(bad));
    const r = cli(['analyst-config', 'validate', file, '--pipeline', manifestPath, '--json']);
    expect(r.status).not.toBe(0);
    const parsed = JSON.parse(r.stdout);
    expect(parsed.errors.some((e: any) => e.pointer === '/pipelineRef/manifestHash/value')).toBe(true);
  });

  it('create emits a validated skeleton pinned to the given pipeline', () => {
    const dir = tmp();
    const file = join(dir, 'new-config.json');
    const r = cli(['analyst-config', 'create', file, '--pipeline', manifestPath]);
    expect(r.status).toBe(0);
    const doc = readJson<any>(file);
    expect(doc.pipelineRef.manifestHash.value).toBe(hashes.manifestHash.value);
    const check = validateDocument('analyst-strategy-config', doc, { pipeline: readJson(manifestPath) });
    expect(check.ok).toBe(true);
  });
});

describe('hash', () => {
  it('pipeline hash matches hashes.json and is stable across runs', () => {
    const r1 = cli(['hash', manifestPath, '--kind', 'pipeline', '--json']);
    const r2 = cli(['hash', manifestPath, '--json']); // kind detected
    expect(r1.status).toBe(0);
    expect(r2.status).toBe(0);
    expect(r1.stdout).toBe(r2.stdout);
    const parsed = JSON.parse(r1.stdout);
    expect(parsed).toEqual(hashes.manifestHash);
  });

  it('analyst-config hash matches hashes.json', () => {
    const r = cli(['hash', analystConfigPath, '--kind', 'analyst-config', '--json']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(hashes.analystConfigHash);
  });

  it('plugin-set hash over the seven official manifests matches hashes.json', () => {
    const dir = tmp();
    const set = [
      'afi-analysis-aiml--2.0.0', 'afi-analysis-news--2.0.0', 'afi-analysis-pattern--2.0.0',
      'afi-analysis-sentiment--2.0.0', 'afi-analysis-technical--2.0.0',
      'afi-merge-enriched-view--1.1.0', 'afi-scorer-froggy-trend-pullback--1.0.0',
    ].map((id) => readJson(join(pluginsDir, `${id}.json`)));
    const file = join(dir, 'set.json');
    writeFileSync(file, JSON.stringify(set));
    const r = cli(['hash', file, '--kind', 'plugin-set', '--json']);
    expect(r.status).toBe(0);
    expect(JSON.parse(r.stdout)).toEqual(hashes.pluginSetHash);
  });

  it('REFUSES to hash an invalid artifact (nonzero exit)', () => {
    const dir = tmp();
    const bad = clone(readJson<any>(manifestPath));
    delete bad.entry;
    const file = join(dir, 'bad.json');
    writeFileSync(file, JSON.stringify(bad));
    const r = cli(['hash', file, '--kind', 'pipeline']);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('refusing to hash');
  });
});

describe('plugin scaffold + init', () => {
  it('scaffold emits a schema-valid manifest and a contract stub', () => {
    const dir = tmp();
    const r = cli(['plugin', 'scaffold', '--id', 'my-news', '--category', 'news', '--dir', dir, '--json']);
    expect(r.status).toBe(0);
    const manifest = readJson<any>(join(dir, 'my-news.plugin.json'));
    expect(validateDocument('analysis-plugin', manifest).ok).toBe(true);
    expect(manifest.category).toBe('news');
    const stub = readFileSync(join(dir, 'my-news.contract.ts'), 'utf-8');
    expect(stub).toContain('MyNewsPlugin');
    expect(stub).toContain("pluginId: 'my-news'");
  });

  it('scaffold rejects an unknown category (nonzero exit)', () => {
    const dir = tmp();
    const r = cli(['plugin', 'scaffold', '--id', 'x', '--category', 'social', '--dir', dir]);
    expect(r.status).not.toBe(0);
  });

  it('init scaffolds a coherent, fully validated project', () => {
    const dir = join(tmp(), 'proj');
    const r = cli(['init', dir, '--pipeline-id', 'demo-pipeline', '--json']);
    expect(r.status).toBe(0);
    const created = JSON.parse(r.stdout).created;
    expect(created.length).toBeGreaterThanOrEqual(6);
    const manifest = readJson<any>(join(dir, 'pipeline.manifest.json'));
    const plugins = [readJson<any>(join(dir, 'plugins/my-technical.plugin.json')), readJson<any>(join(dir, 'plugins/my-scorer.plugin.json'))];
    expect(validateDocument('pipeline', manifest, { plugins }).ok).toBe(true);
    const config = readJson<any>(join(dir, 'analyst-config.json'));
    expect(validateDocument('analyst-strategy-config', config, { pipeline: manifest }).ok).toBe(true);
  });
});

describe('conformance fixtures through the CLI', () => {
  it('every fixture validates through the real CLI path', () => {
    for (const f of ['01-one-category.json', '05-conditional-node.json', '06-repeated-same-category.json']) {
      const r = cli(['pipeline', 'validate', join(conformanceDir, f), '--plugins', pluginsDir]);
      expect(r.status, f).toBe(0);
    }
  });
});

describe('usage errors', () => {
  it('unknown command exits nonzero', () => {
    const r = cli(['frobnicate']);
    expect(r.status).not.toBe(0);
  });
});
