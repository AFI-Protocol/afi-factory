import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { repoRoot, officialDir, readJson } from './helpers.js';
import {
  OPERATIONS,
  getOperation,
  listOperationIds,
  invokeOperation,
  buildCapabilityCatalog,
  catalogHash,
  buildToolDefinitions,
  CATALOG_VERSION,
} from '../src/index.js';
import { executeOperation } from '../src/operations/registry.js';

/**
 * Operation-registry invariants (Section 14.2): one real handler per advertised
 * operation, validated input AND output, unique ids, deterministic + stable
 * catalog, CLI/agent parity, fail-closed unknown ids, read-only ops that never
 * write, and mutating ops that require a workspace. Plus the guardrails: no
 * hand-maintained capability manifest disconnected from handlers, no operation
 * without a handler, no advertised operation without input/output schemas.
 */

const cliPath = join(repoRoot, 'dist', 'cli', 'index.js');
const manifest = readJson<any>(join(officialDir, 'pipeline.manifest.json'));

function cliJson(args: string[]): any {
  try {
    return JSON.parse(execFileSync(process.execPath, [cliPath, ...args], { encoding: 'utf-8' }));
  } catch (e: any) {
    // validate commands exit 1 on invalid but still print JSON on stdout.
    return JSON.parse(e.stdout);
  }
}

describe('operation registry', () => {
  it('every operation has exactly one real handler', () => {
    for (const op of OPERATIONS) {
      expect(typeof op.handler, `${op.operationId} handler`).toBe('function');
    }
  });

  it('every operation carries the full metadata + I/O schema contract', () => {
    for (const op of OPERATIONS) {
      expect(op.operationId, 'operationId').toMatch(/^factory\.[a-zA-Z.]+$/);
      expect(op.operationVersion, `${op.operationId} version`).toMatch(/^\d+\.\d+\.\d+$/);
      expect(op.name.length, `${op.operationId} name`).toBeGreaterThan(0);
      expect(op.description.length, `${op.operationId} description`).toBeGreaterThan(0);
      expect(op.inputSchema, `${op.operationId} inputSchema`).toBeTypeOf('object');
      expect((op.inputSchema as any).type, `${op.operationId} inputSchema.type`).toBe('object');
      expect(op.outputSchema, `${op.operationId} outputSchema`).toBeTypeOf('object');
      expect((op.outputSchema as any).type, `${op.operationId} outputSchema.type`).toBeTruthy();
      expect(['read-only', 'mutating']).toContain(op.mutation);
      expect(['deterministic', 'environment-dependent']).toContain(op.determinism);
      expect(op.fsPolicy).toBeTypeOf('object');
      expect(op.fsPolicy.notes.length).toBeGreaterThan(0);
    }
  });

  it('operation ids are unique', () => {
    const ids = OPERATIONS.map((o) => o.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('exposes exactly the 14 mission operation ids', () => {
    expect(listOperationIds()).toEqual(
      [
        'factory.analystConfig.create',
        'factory.analystConfig.validate',
        'factory.artifact.hash',
        'factory.artifact.package',
        'factory.capabilities.list',
        'factory.pipeline.inspect',
        'factory.pipeline.validate',
        'factory.plugin.scaffold',
        'factory.plugins.list',
        'factory.template.create',
        'factory.template.inspect',
        'factory.template.instantiate',
        'factory.template.validate',
        'factory.official.list',
      ].sort()
    );
  });
});

describe('capability catalog', () => {
  it('is deterministic and hash-stable across builds', () => {
    const a = buildCapabilityCatalog(OPERATIONS);
    const b = buildCapabilityCatalog(OPERATIONS);
    expect(a).toEqual(b);
    expect(catalogHash(a)).toBe(catalogHash(b));
    expect(a.catalogVersion).toBe(CATALOG_VERSION);
  });

  it('contains no timestamps, machine paths, or usernames', () => {
    const text = JSON.stringify(buildCapabilityCatalog(OPERATIONS));
    expect(text).not.toContain(repoRoot);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/); // ISO timestamp
    if (process.env.USER) expect(text).not.toContain(process.env.USER);
    expect(text).not.toContain('/home/');
  });

  it('every catalog entry maps to a registered operation with a handler (no orphan/static entries)', () => {
    const catalog = buildCapabilityCatalog(OPERATIONS);
    expect(catalog.operations.length).toBe(OPERATIONS.length);
    for (const entry of catalog.operations) {
      const op = getOperation(entry.operationId);
      expect(op, `catalog entry ${entry.operationId} has a registered op`).toBeDefined();
      expect(typeof op!.handler).toBe('function');
      expect(entry.inputSchema).toEqual(op!.inputSchema);
      expect(entry.outputSchema).toEqual(op!.outputSchema);
      expect(entry.errorSchema).toBeTypeOf('object');
    }
  });

  it('factory.capabilities.list reproduces the catalog + its hash', async () => {
    const res = await invokeOperation('factory.capabilities.list', {});
    expect(res.ok).toBe(true);
    const catalog = buildCapabilityCatalog(OPERATIONS);
    expect((res.output as any).catalogHash).toBe(catalogHash(catalog));
    expect((res.output as any).operations).toEqual(catalog.operations);
  });
});

describe('invocation contract', () => {
  it('unknown operation ids fail closed', async () => {
    const res = await invokeOperation('factory.does.not.exist', {});
    expect(res.ok).toBe(false);
    expect(res.error!.code).toBe('unknown_operation');
  });

  it('input failing the declared schema is rejected before the handler runs', async () => {
    const res = await invokeOperation('factory.pipeline.validate', { notPipeline: 1 });
    expect(res.ok).toBe(false);
    expect(res.error!.code).toBe('invalid_input');
    expect(res.error!.issues!.length).toBeGreaterThan(0);
  });

  it('mutating operations without a workspace fail closed', async () => {
    const res = await invokeOperation('factory.plugin.scaffold', { pluginId: 'x', category: 'technical' });
    expect(res.ok).toBe(false);
    expect(res.error!.code).toBe('workspace_required');
  });

  it('a forged op reusing a registered id cannot poison the real op validator', async () => {
    // Regression: the validator cache is keyed by schema-object identity, so a
    // forged def sharing a registered operationId but a looser schema cannot
    // cause the real operation to enforce the looser schema.
    const spoof = {
      operationId: 'factory.template.validate', // reuse a real id
      operationVersion: '1.0.0',
      name: 'spoof',
      description: 'spoof',
      inputSchema: { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', additionalProperties: true },
      outputSchema: { $schema: 'http://json-schema.org/draft-07/schema#', type: 'object', additionalProperties: true },
      mutation: 'read-only',
      determinism: 'deterministic',
      fsPolicy: { readsWorkspace: false, writesWorkspace: false, readsBundledAssets: false, notes: 'spoof' },
      handler: () => ({ anything: 1 }),
    } as any;
    // Prime the cache via the forged def first (loose schema accepts anything).
    const primed = await executeOperation(spoof, { template: 'not-an-object', extra: 1 });
    expect(primed.ok).toBe(true);
    // The REAL registered op must still enforce ITS declared strict schema.
    const real = await invokeOperation('factory.template.validate', { template: 'not-an-object', extra: 1 });
    expect(real.ok).toBe(false);
    expect(real.error!.code).toBe('invalid_input');
  });

  it('read-only operations perform no writes', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'afi-ro-'));
    const cwd = process.cwd();
    process.chdir(ws);
    try {
      for (const op of OPERATIONS.filter((o) => o.mutation === 'read-only')) {
        // Invoke with whatever input we have; even on validation error, nothing must be written.
        const input =
          op.operationId === 'factory.pipeline.validate' || op.operationId === 'factory.pipeline.inspect'
            ? { pipeline: manifest }
            : op.operationId === 'factory.artifact.hash'
              ? { artifact: manifest }
              : op.operationId === 'factory.analystConfig.create'
                ? { pipeline: manifest }
                : {};
        await invokeOperation(op.operationId, input, { workspace: { root: ws } });
        expect(op.fsPolicy.writesWorkspace, `${op.operationId} declares no writes`).toBe(false);
      }
      expect(readdirSync(ws)).toEqual([]);
    } finally {
      process.chdir(cwd);
    }
  });
});

describe('CLI / agent parity', () => {
  it('pipeline.validate: agent result equals CLI result for the same manifest', async () => {
    const cliResult = cliJson(['pipeline', 'validate', join(officialDir, 'pipeline.manifest.json'), '--json']);
    const agent = await invokeOperation('factory.pipeline.validate', { pipeline: manifest });
    expect(agent.ok).toBe(true);
    expect((agent.output as any).valid).toBe(cliResult.valid);
    expect((agent.output as any).errors).toEqual(cliResult.errors);
  });

  it('artifact.hash: agent hash equals the CLI hash for the same manifest', async () => {
    const cliResult = cliJson(['hash', join(officialDir, 'pipeline.manifest.json'), '--json']);
    const agent = await invokeOperation('factory.artifact.hash', { artifact: manifest, kind: 'pipeline' });
    expect((agent.output as any).hash.value).toBe(cliResult.value);
  });
});
