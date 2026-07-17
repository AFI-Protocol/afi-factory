import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { repoRoot, readJson, clone } from './helpers.js';
import {
  canonicalize,
  sha256Hex,
  stripExcluded,
  canonicalHashOf,
  manifestHash,
  analystConfigHash,
  pluginSetHash,
  CANONICALIZATION_VERSION,
  DOMAIN_TAGS,
} from '../src/canonical-json.js';

interface KatVector {
  name: string;
  input: unknown;
  excludedFields?: string[];
  expectedCanonicalForm: string;
  expectedSha256: string;
  artifactType?: string;
}

interface KatFile {
  schema: string;
  canonicalizationVersion: string;
  vectors: KatVector[];
}

const kat = readJson<KatFile>(join(repoRoot, 'src', 'governed-schema', 'canonical-json-hashing.kat.json'));

describe('canonical-json-hashing.v1 — vendored KAT conformance', () => {
  it('the KAT file is the governed vector set (6 vectors, afi.hash.v1)', () => {
    expect(kat.schema).toBe('afi.canonical-json-hashing-kat.v1');
    expect(kat.canonicalizationVersion).toBe(CANONICALIZATION_VERSION);
    expect(kat.vectors).toHaveLength(6);
  });

  for (const vector of kat.vectors) {
    it(`vector '${vector.name}': canonical form and sha256 match byte-exactly`, () => {
      const material =
        vector.excludedFields && vector.excludedFields.length
          ? stripExcluded(vector.input as object, vector.excludedFields)
          : vector.input;
      const canonical = canonicalize(material);
      expect(canonical).toBe(vector.expectedCanonicalForm);
      expect(sha256Hex(canonical)).toBe(vector.expectedSha256);
    });
  }

  it('manifestHash agrees with the pipeline-manifest KAT vector (same digest, D-FCP-7 domain tag)', () => {
    const vector = kat.vectors.find((v) => v.name === 'pipeline-manifest-excludes')!;
    const hash = manifestHash(vector.input as any);
    expect(hash.value).toBe(vector.expectedSha256);
    expect(hash.algorithm).toBe('sha256');
    expect(hash.canonicalizationVersion).toBe('afi.hash.v1');
    expect(hash.domainTag).toBe(DOMAIN_TAGS.compositionManifest);
    expect(hash.domainTag).toBe('afi.d2.composition-manifest');
  });

  it('analystConfigHash agrees with the analyst-config KAT vector (same digest, D-FCP-7 domain tag)', () => {
    const vector = kat.vectors.find((v) => v.name === 'analyst-config-excludes')!;
    const hash = analystConfigHash(vector.input as any);
    expect(hash.value).toBe(vector.expectedSha256);
    expect(hash.domainTag).toBe('afi.d2.analyst-config');
  });
});

describe('pluginSetHash composition rule', () => {
  const plugins = [
    { pluginId: 'zeta', pluginVersion: '1.0.0', implementationVersion: '1.2.3' },
    { pluginId: 'alpha', pluginVersion: '2.0.0', implementationVersion: '0.9.0' },
    { pluginId: 'mid', pluginVersion: '1.1.0', implementationVersion: '1.1.0' },
  ];

  it('hashes {schema: afi.plugin-set.v1, plugins sorted by pluginId} under afi.d2.plugin-set', () => {
    const hash = pluginSetHash(plugins);
    const expectedMaterial = {
      schema: 'afi.plugin-set.v1',
      plugins: [
        { pluginId: 'alpha', pluginVersion: '2.0.0', implementationVersion: '0.9.0' },
        { pluginId: 'mid', pluginVersion: '1.1.0', implementationVersion: '1.1.0' },
        { pluginId: 'zeta', pluginVersion: '1.0.0', implementationVersion: '1.2.3' },
      ],
    };
    expect(hash.value).toBe(sha256Hex(canonicalize(expectedMaterial)));
    expect(hash.domainTag).toBe('afi.d2.plugin-set');
  });

  it('is order-insensitive by construction', () => {
    const shuffled = [plugins[2], plugins[0], plugins[1]];
    expect(pluginSetHash(shuffled).value).toBe(pluginSetHash(plugins).value);
  });

  it('extra manifest fields never leak into the set hash', () => {
    const withExtras = plugins.map((p) => ({
      ...p,
      description: 'volatile annotation',
      paramsSchema: {},
    })) as any;
    expect(pluginSetHash(withExtras).value).toBe(pluginSetHash(plugins).value);
  });
});

describe('exclusion + canonicalization edge behaviour', () => {
  it('exclusion strips only top-level named fields', () => {
    const artifact = {
      schema: 'x',
      metadata: { volatile: true },
      nested: { metadata: 'semantic' },
    };
    const stripped = stripExcluded(artifact, ['metadata']);
    expect(stripped).toEqual({ schema: 'x', nested: { metadata: 'semantic' } });
  });

  it('annotations never perturb a hash (description/metadata excluded whether valid or not)', () => {
    const base = { schema: 'afi.pipeline.v1', entry: 'a', nodes: [], edges: [] };
    const annotated = clone(base) as any;
    annotated.description = 'x'.repeat(10);
    annotated.metadata = { anything: [1, 2, 3] };
    expect(canonicalHashOf(annotated, 't', ['description', 'metadata']).value).toBe(
      canonicalHashOf(base, 't', ['description', 'metadata']).value
    );
  });

  it('numbers serialize in shortest ECMAScript round-trip form', () => {
    expect(canonicalize({ a: 1.0, b: 1e21, c: 0.0000001, d: -0 })).toBe('{"a":1,"b":1e+21,"c":1e-7,"d":0}');
  });
});
