/**
 * Canonical JSON hashing — implements canonical-json-hashing.v1 EXACTLY per
 * the vendored governed spec (src/governed-schema/canonical-json-hashing.v1.md,
 * byte-pinned from afi-config schemas/hashing/canonical-json-hashing.v1.md):
 *
 *   hash = SHA-256 over the UTF-8 bytes of the canonically serialized JSON
 *   value, after removing the artifact type's excluded TOP-LEVEL fields.
 *
 * Serialization (RFC 8785-aligned for the JSON subset these artifacts use):
 * object keys sorted recursively by UTF-16 code units, arrays in authored
 * order, no insignificant whitespace, numbers in shortest ECMAScript
 * round-trip form, strings as JSON.stringify emits them, literals verbatim.
 *
 * Conformance is proven by tests/hashing-kat.test.ts against every vendored
 * KAT vector (src/governed-schema/canonical-json-hashing.kat.json).
 *
 * Domain tags: the D-FCP-7 registered composition tags
 * (afi.d2.composition-manifest / afi.d2.analyst-config / afi.d2.plugin-set)
 * are used for the manifestHash / analystConfigHash / pluginSetHash helpers,
 * per afi-governance/decisions/factory-configurable-pipelines-v1.md §7.
 */
import { createHash } from 'node:crypto';
import type { CanonicalHash } from './generated/canonical-hash.js';
import type { PipelineManifest } from './generated/pipeline.js';
import type { AnalystStrategyConfig } from './generated/analyst-strategy-config.js';
import type { AnalysisPluginManifest } from './generated/analysis-plugin.js';

export const CANONICALIZATION_VERSION = 'afi.hash.v1';

/**
 * Canonical-hash domain tags registered by D-FCP-7
 * (afi-governance/decisions/factory-configurable-pipelines-v1.md §7).
 */
export const DOMAIN_TAGS = {
  compositionManifest: 'afi.d2.composition-manifest',
  analystConfig: 'afi.d2.analyst-config',
  pluginSet: 'afi.d2.plugin-set',
} as const;

/** Excluded top-level fields per artifact type (canonical-json-hashing.v1 §3). */
export const EXCLUDED_FIELDS = {
  'afi.pipeline.v1': ['description', 'metadata'],
  'afi.pipeline-template.v1': ['description', 'metadata'],
  'afi.analysis-plugin.v1': ['description', 'metadata'],
  'afi.analyst-strategy-config.v1': ['metadata'],
  'afi.analyst-strategy-registration.v1': ['registeredAt'],
} as const;

/**
 * Canonical serialization (the governed reference implementation, verbatim
 * semantics): recursively key-sorted objects, authored-order arrays, no
 * whitespace, JSON.stringify scalar forms.
 */
export function canonicalize(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v)!;
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  return (
    '{' +
    Object.keys(v)
      .sort()
      .map((k) => JSON.stringify(k) + ':' + canonicalize((v as Record<string, unknown>)[k]))
      .join(',') +
    '}'
  );
}

export function sha256Hex(utf8: string): string {
  return createHash('sha256').update(utf8, 'utf-8').digest('hex');
}

/**
 * Removes the named TOP-LEVEL fields only (a nested key with the same name is
 * semantic data and survives — canonical-json-hashing.v1 §3).
 */
export function stripExcluded<T extends object>(artifact: T, excludedFields: readonly string[]): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(artifact)) {
    if (!excludedFields.includes(k)) out[k] = val;
  }
  return out as Partial<T>;
}

/** Builds a CanonicalHash v1 reference over an arbitrary JSON value. */
export function canonicalHashOf(
  value: unknown,
  domainTag: string,
  excludedFields: readonly string[] = []
): CanonicalHash {
  const material =
    excludedFields.length > 0 && value !== null && typeof value === 'object' && !Array.isArray(value)
      ? stripExcluded(value as object, excludedFields)
      : value;
  return {
    algorithm: 'sha256',
    canonicalizationVersion: CANONICALIZATION_VERSION,
    domainTag,
    value: sha256Hex(canonicalize(material)),
  };
}

/**
 * manifestHash: canonical hash of an afi.pipeline.v1 manifest
 * (top-level description/metadata excluded; domain tag
 * afi.d2.composition-manifest per D-FCP-7).
 */
export function manifestHash(pipeline: PipelineManifest): CanonicalHash {
  return canonicalHashOf(pipeline, DOMAIN_TAGS.compositionManifest, EXCLUDED_FIELDS['afi.pipeline.v1']);
}

/**
 * analystConfigHash: canonical hash of a resolved afi.analyst-strategy-config.v1
 * (top-level metadata excluded per the spec; domain tag afi.d2.analyst-config
 * per D-FCP-7).
 */
export function analystConfigHash(config: AnalystStrategyConfig): CanonicalHash {
  return canonicalHashOf(config, DOMAIN_TAGS.analystConfig, EXCLUDED_FIELDS['afi.analyst-strategy-config.v1']);
}

/**
 * pluginSetHash: canonical hash of
 *   { schema: 'afi.plugin-set.v1',
 *     plugins: [{ pluginId, pluginVersion, implementationVersion }, ...] }
 * with plugins sorted by pluginId (then pluginVersion for repeated ids, plain
 * string comparison) — order-insensitive by construction. Domain tag
 * afi.d2.plugin-set per D-FCP-7. This composition rule is documented in the
 * README ("Pipeline identity & hashing").
 */
export function pluginSetHash(
  plugins: ReadonlyArray<
    Pick<AnalysisPluginManifest, 'pluginId' | 'pluginVersion' | 'implementationVersion'>
  >
): CanonicalHash {
  const entries = plugins
    .map((p) => ({
      pluginId: p.pluginId,
      pluginVersion: p.pluginVersion,
      implementationVersion: p.implementationVersion,
    }))
    .sort(
      (a, b) =>
        (a.pluginId < b.pluginId ? -1 : a.pluginId > b.pluginId ? 1 : 0) ||
        (a.pluginVersion < b.pluginVersion ? -1 : a.pluginVersion > b.pluginVersion ? 1 : 0)
    );
  return canonicalHashOf({ schema: 'afi.plugin-set.v1', plugins: entries }, DOMAIN_TAGS.pluginSet);
}
