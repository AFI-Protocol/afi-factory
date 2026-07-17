import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { officialDir, conformanceDir, readJson, officialPlugins, clone } from './helpers.js';
import { invokeOperation, readWorkspaceJson } from '../src/index.js';
import { executeOperation } from '../src/operations/registry.js';
import type { OperationDef } from '../src/index.js';

/**
 * Agent authoring workflows A–D (Section 7 / 14.6), executed ENTIRELY through
 * the operation layer. Every produced artifact is re-validated against the
 * governed schema closure. Failures are structured and precise.
 */

const froggyTemplate = readJson<any>(join(officialDir, 'template.json'));
const froggyManifest = readJson<any>(join(officialDir, 'pipeline.manifest.json'));
const froggyHashes = readJson<any>(join(officialDir, 'hashes.json'));
const plugins = officialPlugins();
const fixture01 = readJson<any>(join(conformanceDir, '01-one-category.json'));
const fixture04 = readJson<any>(join(conformanceDir, '04-branch-deterministic-join.json'));

async function ok(id: string, input?: unknown, ctx?: unknown) {
  const res = await invokeOperation(id, input, ctx as any);
  expect(res.ok, `${id} -> ${JSON.stringify(res.error)}`).toBe(true);
  return res.output as any;
}

describe('Workflow A — inspect', () => {
  it('lists capabilities, plugins, templates; inspects Froggy; returns canonical identity', async () => {
    const caps = await ok('factory.capabilities.list');
    expect(caps.operations.length).toBe(14);

    const comps = await ok('factory.plugins.list', {});
    expect(comps.analysisCategories).toEqual(['technical', 'pattern', 'sentiment', 'news', 'aiMl']);
    expect(comps.components.length).toBeGreaterThan(0);

    const tmpl = await ok('factory.templates.list', {});
    expect(tmpl.templates.map((t: any) => t.templateDir)).toContain('froggy-trend-pullback');

    const inspection = (await ok('factory.template.inspect', { template: froggyTemplate })).inspection;
    expect(inspection.executionOrder[0]).toBe('technical');
    expect(inspection.waves.length).toBeGreaterThan(1); // parallel branches
    expect(inspection.nodes.some((n: any) => n.category === 'scorer')).toBe(true);

    const hash = (await ok('factory.artifact.hash', { artifact: froggyManifest, kind: 'pipeline' })).hash;
    expect(hash.value).toBe(froggyHashes.manifestHash.value); // canonical manifest identity
  });
});

describe('Workflow B — create and validate', () => {
  it('validates a parallel + deterministic-join + single-scorer pipeline, inspects it, and hashes it', async () => {
    const validation = await ok('factory.pipeline.validate', { pipeline: fixture04 });
    expect(validation.valid).toBe(true);

    const inspection = (await ok('factory.pipeline.inspect', { pipeline: fixture04 })).inspection;
    expect(inspection.waves.length).toBeGreaterThan(1); // pattern + sentiment run in parallel
    expect(inspection.joins.map((j: any) => j.nodeId)).toContain('merge');
    expect(inspection.nodes.filter((n: any) => n.category === 'scorer').length).toBe(1);

    const h1 = (await ok('factory.artifact.hash', { artifact: fixture04 })).hash;
    const h2 = (await ok('factory.artifact.hash', { artifact: fixture04 })).hash;
    expect(h1.value).toBe(h2.value); // stable
  });
});

describe('Workflow C — instantiate and package', () => {
  it('instantiates Froggy, validates, produces an analyst-config, hashes, and packages a deployable bundle', async () => {
    const inst = await ok('factory.template.instantiate', { template: froggyTemplate, params: {}, plugins });
    expect(inst.valid).toBe(true);
    expect(inst.manifestHash.value).toBe(froggyHashes.manifestHash.value);
    const manifest = inst.pipeline;

    const v = await ok('factory.pipeline.validate', { pipeline: manifest, plugins });
    expect(v.valid).toBe(true);

    const created = await ok('factory.analystConfig.create', { pipeline: manifest });
    expect(created.valid).toBe(true);
    expect(created.analystConfigHash).toBeDefined();

    const pluginSetHash = (await ok('factory.artifact.hash', { artifact: plugins, kind: 'plugin-set' })).hash;
    expect(pluginSetHash.value).toBe(froggyHashes.pluginSetHash.value);

    const ws = mkdtempSync(join(tmpdir(), 'afi-pkg-'));
    const pkg = await ok(
      'factory.artifact.package',
      { pipeline: manifest, analystConfig: created.config, plugins, dir: 'bundle' },
      { workspace: { root: ws } }
    );
    expect(pkg.written).toContain('bundle/pipeline.manifest.json');
    expect(pkg.written).toContain('bundle/analyst-config.json');
    expect(pkg.written).toContain('bundle/hashes.json');
    expect(pkg.hashes.manifestHash.value).toBe(froggyHashes.manifestHash.value);

    // The packaged manifest re-validates against the governed contract.
    const written = readWorkspaceJson(ws, 'bundle/pipeline.manifest.json');
    const reval = await ok('factory.pipeline.validate', { pipeline: written, plugins });
    expect(reval.valid).toBe(true);
  });
});

describe('Workflow D — failure honesty', () => {
  it('invalid category -> structured validation failure', async () => {
    const bad = clone(fixture01);
    bad.nodes[0].category = 'astrology';
    const r = await ok('factory.pipeline.validate', { pipeline: bad });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('unknown plugin -> binding error', async () => {
    const r = await ok('factory.pipeline.validate', { pipeline: fixture01, plugins: [] });
    expect(r.valid).toBe(false);
    expect(JSON.stringify(r.errors)).toMatch(/plugin|binding|unknown/i);
  });

  it('invalid node configuration -> config binding error', async () => {
    const bad = clone(froggyManifest);
    const tech = bad.nodes.find((n: any) => n.id === 'technical');
    tech.config = { candleLimit: 'not-an-integer' };
    const r = await ok('factory.pipeline.validate', { pipeline: bad, plugins });
    expect(r.valid).toBe(false);
    expect(r.errors.length).toBeGreaterThan(0);
  });

  it('cycle -> validation failure', async () => {
    const bad = clone(fixture04);
    bad.edges.push({ from: 'scorer', to: 'technical' });
    const r = await ok('factory.pipeline.validate', { pipeline: bad });
    expect(r.valid).toBe(false);
  });

  it('unreachable node -> validation failure', async () => {
    const bad = clone(fixture01);
    bad.nodes.push({ id: 'orphan', category: 'pattern', pluginId: 'afi-analysis-pattern', pluginVersion: '1.0.0' });
    const r = await ok('factory.pipeline.validate', { pipeline: bad });
    expect(r.valid).toBe(false);
  });

  it('missing scorer -> validation failure', async () => {
    const bad = clone(fixture01);
    bad.nodes = bad.nodes.filter((n: any) => n.category !== 'scorer');
    bad.edges = [];
    const r = await ok('factory.pipeline.validate', { pipeline: bad });
    expect(r.valid).toBe(false);
  });

  it('multiple scorers -> validation failure', async () => {
    const bad = clone(fixture01);
    bad.nodes.push({ id: 'scorer2', category: 'scorer', pluginId: 'afi-scorer-froggy-trend-pullback', pluginVersion: '1.0.0' });
    bad.edges.push({ from: 'technical', to: 'scorer2' });
    const r = await ok('factory.pipeline.validate', { pipeline: bad });
    expect(r.valid).toBe(false);
  });

  it('invalid template parameter -> instantiation failure', async () => {
    const r = await ok('factory.template.instantiate', { template: froggyTemplate, params: { candleLimit: 0 }, plugins });
    expect(r.valid).toBe(false);
    expect(JSON.stringify(r.errors)).toMatch(/candleLimit/);
  });

  it('unsupported operation id -> unknown_operation', async () => {
    const res = await invokeOperation('factory.made.up', {});
    expect(res.ok).toBe(false);
    expect(res.error!.code).toBe('unknown_operation');
  });

  it('malformed input -> invalid_input', async () => {
    const res = await invokeOperation('factory.pipeline.validate', {});
    expect(res.ok).toBe(false);
    expect(res.error!.code).toBe('invalid_input');
  });

  it('path outside the workspace -> path_escape', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'afi-esc-'));
    const res = await invokeOperation(
      'factory.plugin.scaffold',
      { pluginId: 'x', category: 'technical', dir: '../../etc' },
      { workspace: { root: ws } }
    );
    expect(res.ok).toBe(false);
    expect(res.error!.code).toBe('path_escape');
  });

  it('handler output that violates its declared schema -> invalid_output', async () => {
    const lyingOp = {
      operationId: 'factory.__test.lies',
      operationVersion: '1.0.0',
      name: 'test',
      description: 'a handler that returns the wrong shape',
      inputSchema: { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', additionalProperties: false, properties: {} },
      outputSchema: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        required: ['x'],
        additionalProperties: false,
        properties: { x: { type: 'string' } },
      },
      mutation: 'read-only',
      determinism: 'deterministic',
      fsPolicy: { readsWorkspace: false, writesWorkspace: false, readsBundledAssets: false, notes: 'test' },
      handler: () => ({ y: 42 }),
    } as unknown as OperationDef;
    const res = await executeOperation(lyingOp, {});
    expect(res.ok).toBe(false);
    expect(res.error!.code).toBe('invalid_output');
  });
});
