import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { officialDir, readJson, officialPlugins, clone } from './helpers.js';
import {
  invokeOperation,
  readWorkspaceJson,
  buildCapabilityCatalog,
  buildToolDefinitions,
  OPERATIONS,
} from '../src/index.js';

/**
 * PBF-GOV — provider-backed pipeline authoring (afi-factory Wave 1).
 *
 * A category node may carry a versioned, NON-SECRET providerInstanceRef. Factory
 * authors/validates/hashes/packages/inspects it across all five surfaces, and
 * NEVER resolves a credential. The reference carries identity + version only;
 * the schema (additionalProperties:false) plus the semantic layer keep it
 * category-scoped and credential-free.
 */

const froggyManifest = readJson<any>(join(officialDir, 'pipeline.manifest.json'));
const froggyHashes = readJson<any>(join(officialDir, 'hashes.json'));
const plugins = officialPlugins();

const TECH_REF = { providerInstanceId: 'pi-technical-local-tenant-a', recordVersion: '1.0.0' };
const NEWS_REF = { providerInstanceId: 'pi-news-http-tenant-a', recordVersion: '1.0.0' };

// Secret-name denylist scanner (mirror of the afi-config defense-in-depth scan).
const SECRET_NAMES = new Set([
  'apikey', 'token', 'accesstoken', 'secret', 'secretvalue', 'password', 'authorization',
  'privatekey', 'refreshtoken', 'oauth', 'cookie', 'sessiontoken', 'bearer', 'headervalue',
  'credential', 'credentials',
]);
function secretFieldPaths(obj: unknown, path = '$'): string[] {
  const out: string[] = [];
  if (obj === null || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    obj.forEach((v, i) => out.push(...secretFieldPaths(v, `${path}[${i}]`)));
    return out;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (SECRET_NAMES.has(k.toLowerCase().replace(/[-_]/g, ''))) out.push(`${path}.${k}`);
    out.push(...secretFieldPaths(v, `${path}.${k}`));
  }
  return out;
}

function withRefOn(category: string, ref: unknown) {
  const m = clone(froggyManifest);
  const node = m.nodes.find((n: any) => n.category === category);
  node.providerInstanceRef = ref;
  return m;
}

async function ok(id: string, input?: unknown, ctx?: unknown) {
  const res = await invokeOperation(id, input, ctx as any);
  expect(res.ok, `${id} -> ${JSON.stringify(res.error)}`).toBe(true);
  return res.output as any;
}

describe('PBF-GOV factory — authoring provider-backed nodes', () => {
  it('a technical category node may carry a providerInstanceRef and still validate (with plugin binding)', async () => {
    const v = await ok('factory.pipeline.validate', { pipeline: withRefOn('technical', TECH_REF), plugins });
    expect(v.valid).toBe(true);
  });

  it('a news category node may carry a providerInstanceRef and still validate', async () => {
    const v = await ok('factory.pipeline.validate', { pipeline: withRefOn('news', NEWS_REF), plugins });
    expect(v.valid).toBe(true);
  });

  it('rejects a providerInstanceRef on the scorer seam (category incompatibility)', async () => {
    const v = await ok('factory.pipeline.validate', { pipeline: withRefOn('scorer', TECH_REF) });
    expect(v.valid).toBe(false);
    expect(JSON.stringify(v.errors)).toContain('providerInstanceRef');
  });

  it('rejects a providerInstanceRef on a merge node (category incompatibility)', async () => {
    const v = await ok('factory.pipeline.validate', { pipeline: withRefOn('merge', TECH_REF) });
    expect(v.valid).toBe(false);
    expect(JSON.stringify(v.errors)).toContain('providerInstanceRef');
  });

  it('rejects a providerInstanceRef missing its version pin (schema)', async () => {
    const v = await ok('factory.pipeline.validate', { pipeline: withRefOn('technical', { providerInstanceId: 'pi-x' }) });
    expect(v.valid).toBe(false);
  });

  it('rejects a providerInstanceRef carrying a credential/secret field (schema, additionalProperties:false)', async () => {
    for (const bad of [
      { ...TECH_REF, apiKey: 'zzTOPSECRETzz' },
      { ...TECH_REF, credentialRef: 'newsdata-key-tenant-a' },
      { ...TECH_REF, token: 'zzTOPSECRETzz' },
    ]) {
      const v = await ok('factory.pipeline.validate', { pipeline: withRefOn('technical', bad) });
      expect(v.valid, `ref ${JSON.stringify(bad)} must be rejected`).toBe(false);
    }
  });
});

describe('PBF-GOV factory — hashing (ref is in canonical hash material; deterministic)', () => {
  it('the froggy baseline hash is UNCHANGED by adding the optional field elsewhere (byte-stable)', async () => {
    const h = (await ok('factory.artifact.hash', { artifact: froggyManifest, kind: 'pipeline' })).hash;
    expect(h.value).toBe(froggyHashes.manifestHash.value);
  });

  it('adding a providerInstanceRef CHANGES the manifest hash (nested field is hashed) and is deterministic', async () => {
    const withRef = withRefOn('technical', TECH_REF);
    const h1 = (await ok('factory.artifact.hash', { artifact: withRef, kind: 'pipeline' })).hash;
    const h2 = (await ok('factory.artifact.hash', { artifact: withRef, kind: 'pipeline' })).hash;
    expect(h1.value).toBe(h2.value); // deterministic
    expect(h1.value).not.toBe(froggyHashes.manifestHash.value); // materially included
  });
});

describe('PBF-GOV factory — packaging + inspection carry the ref, never a secret', () => {
  it('packages a provider-backed pipeline; the written bundle carries the ref and NO secret-named field', async () => {
    const manifest = withRefOn('news', NEWS_REF);
    const ws = mkdtempSync(join(tmpdir(), 'afi-pbf-'));
    const pkg = await ok('factory.artifact.package', { pipeline: manifest, plugins, dir: 'bundle' }, { workspace: { root: ws } });
    expect(pkg.written).toContain('bundle/pipeline.manifest.json');
    const written = readWorkspaceJson(ws, 'bundle/pipeline.manifest.json');
    const newsNode = (written as any).nodes.find((n: any) => n.category === 'news');
    expect(newsNode.providerInstanceRef).toEqual(NEWS_REF);
    // No secret anywhere in the packaged bundle (manifest + hashes).
    expect(secretFieldPaths(written)).toEqual([]);
    expect(secretFieldPaths(pkg)).toEqual([]);
    // Re-validates against the governed contract.
    const reval = await ok('factory.pipeline.validate', { pipeline: written, plugins });
    expect(reval.valid).toBe(true);
  });

  it('inspection surfaces the non-secret provider identity in the node table', async () => {
    const insp = (await ok('factory.pipeline.inspect', { pipeline: withRefOn('technical', TECH_REF) })).inspection;
    const techRow = insp.nodes.find((n: any) => n.category === 'technical');
    expect(techRow.providerInstanceRef).toEqual(TECH_REF);
    expect(secretFieldPaths(insp)).toEqual([]);
  });
});

describe('PBF-GOV factory — five-surface parity (no per-field wiring, no secret)', () => {
  it('the operation set is still exactly 14 and every surface projects it 1:1', () => {
    expect(OPERATIONS.length).toBe(14);
    const catalog = buildCapabilityCatalog(OPERATIONS);
    const tools = buildToolDefinitions(OPERATIONS);
    expect(catalog.operations.length).toBe(14);
    expect(tools.length).toBe(14);
    // The field flows through the opaque artifact envelopes; no surface exposes a credential.
    expect(secretFieldPaths(catalog)).toEqual([]);
    expect(secretFieldPaths(tools)).toEqual([]);
  });

  it('the MCP tools/call surface carries the ref and rejects a secret-bearing ref (same central validation)', async () => {
    const good = await invokeOperation('factory.pipeline.validate', { pipeline: withRefOn('technical', TECH_REF), plugins });
    expect(good.ok && (good.output as any).valid).toBe(true);
    const bad = await invokeOperation('factory.pipeline.validate', { pipeline: withRefOn('technical', { ...TECH_REF, apiKey: 'zzTOPSECRETzz' }) });
    // schema rejects the secret-bearing ref; the marker never reaches any output surface
    expect((bad.output as any)?.valid ?? false).toBe(false);
    expect(secretFieldPaths(bad)).toEqual([]);
    expect(JSON.stringify(bad)).not.toContain('zzTOPSECRETzz');
  });
});
