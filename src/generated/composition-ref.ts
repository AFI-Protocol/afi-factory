/* GENERATED FILE — DO NOT EDIT.
 * Derived from the vendored governed schema closure (src/governed-schema/)
 * by scripts/codegen.mjs (json-schema-to-typescript). Regenerate with
 * `npm run codegen`; freshness is enforced by tests/codegen-freshness.test.ts.
 */

/**
 * The canonical composition provenance stamp (afi.composition-ref.v1): the COMPLETE, hash-pinned identity of the composition that produced one scored signal — pipeline identity + canonical manifest hash, analyst-config hash, scorer plugin identity, the hash of the bound plugin-manifest set, the hash of the deterministic execution summary, and the hash of the enrichment bundle. Every field is REQUIRED and every hash is a CanonicalHash v1 ($ref ../provenance/v1/canonical-hash.schema.json): a canonical scored-signal evidence record either carries the complete composition provenance required by this contract or is invalid. This realizes the reconciliation report's §9 N1 'canonical graph provenance' item as a dedicated referenced object (avoiding N5's strategyVersion overloading).
 */
export interface CompositionRef {
  /**
   * Schema-id version of the composition ref.
   */
  schema: "afi.composition-ref.v1";
  /**
   * pipelineId of the afi.pipeline.v1 manifest that composed this score.
   */
  pipelineId: string;
  /**
   * pipelineVersion of that manifest (WITH v prefix, matching the pipeline contract).
   */
  pipelineVersion: string;
  manifestHash: CanonicalHash;
  analystConfigHash: CanonicalHash1;
  /**
   * pluginId of the scorer plugin that produced the score (the pipeline's single scorer node binding).
   */
  scorerPluginId: string;
  /**
   * pluginVersion of that scorer plugin (semver, no v prefix).
   */
  scorerPluginVersion: string;
  pluginSetHash: CanonicalHash2;
  executionSummaryHash: CanonicalHash3;
  enrichmentHash: CanonicalHash4;
}
/**
 * CanonicalHash v1 of the executed pipeline manifest (domain tag afi.factory.pipeline-manifest; description/metadata excluded per canonical-json-hashing.v1).
 */
export interface CanonicalHash {
  /**
   * Hash algorithm for off-chain canonical domains. v1 fixes this to sha256. keccak256 is reserved for on-chain domains and is intentionally NOT representable here.
   */
  algorithm: "sha256";
  /**
   * Version pin of the canonical serialization rules the digest was computed over (e.g. 'afi.hash.v1'). Distinct from the schema version of the hashed object.
   */
  canonicalizationVersion: string;
  /**
   * Domain-separation tag naming the off-chain domain the digest belongs to (e.g. 'afi.d2.signal-input', 'afi.d2.enrichment-bundle', 'afi.d2.scored-output'). Prevents cross-domain hash reuse.
   */
  domainTag: string;
  /**
   * The digest itself: 64 lowercase hex characters (SHA-256). Never a raw payload.
   */
  value: string;
  /**
   * OPTIONAL migration-compatibility pointer to a pre-District-2 hash value or reference (e.g. a USS v1.1 provenance.ingestHash). Non-authoritative; retained only so migrated records can be correlated.
   */
  legacyHashRef?: string;
}
/**
 * CanonicalHash v1 of the resolved afi.analyst-strategy-config.v1 (domain tag afi.factory.analyst-config; metadata excluded). MUST equal the registration's analystConfigHash.
 */
export interface CanonicalHash1 {
  /**
   * Hash algorithm for off-chain canonical domains. v1 fixes this to sha256. keccak256 is reserved for on-chain domains and is intentionally NOT representable here.
   */
  algorithm: "sha256";
  /**
   * Version pin of the canonical serialization rules the digest was computed over (e.g. 'afi.hash.v1'). Distinct from the schema version of the hashed object.
   */
  canonicalizationVersion: string;
  /**
   * Domain-separation tag naming the off-chain domain the digest belongs to (e.g. 'afi.d2.signal-input', 'afi.d2.enrichment-bundle', 'afi.d2.scored-output'). Prevents cross-domain hash reuse.
   */
  domainTag: string;
  /**
   * The digest itself: 64 lowercase hex characters (SHA-256). Never a raw payload.
   */
  value: string;
  /**
   * OPTIONAL migration-compatibility pointer to a pre-District-2 hash value or reference (e.g. a USS v1.1 provenance.ingestHash). Non-authoritative; retained only so migrated records can be correlated.
   */
  legacyHashRef?: string;
}
/**
 * CanonicalHash v1 over the canonically ordered set of ALL bound afi.analysis-plugin.v1 manifests of the executed composition (domain tag afi.factory.plugin-set; per-manifest description/metadata excluded).
 */
export interface CanonicalHash2 {
  /**
   * Hash algorithm for off-chain canonical domains. v1 fixes this to sha256. keccak256 is reserved for on-chain domains and is intentionally NOT representable here.
   */
  algorithm: "sha256";
  /**
   * Version pin of the canonical serialization rules the digest was computed over (e.g. 'afi.hash.v1'). Distinct from the schema version of the hashed object.
   */
  canonicalizationVersion: string;
  /**
   * Domain-separation tag naming the off-chain domain the digest belongs to (e.g. 'afi.d2.signal-input', 'afi.d2.enrichment-bundle', 'afi.d2.scored-output'). Prevents cross-domain hash reuse.
   */
  domainTag: string;
  /**
   * The digest itself: 64 lowercase hex characters (SHA-256). Never a raw payload.
   */
  value: string;
  /**
   * OPTIONAL migration-compatibility pointer to a pre-District-2 hash value or reference (e.g. a USS v1.1 provenance.ingestHash). Non-authoritative; retained only so migrated records can be correlated.
   */
  legacyHashRef?: string;
}
/**
 * CanonicalHash v1 of the deterministic, TIMESTAMP-FREE execution summary of this run (domain tag afi.reactor.execution-summary): nodes executed, degradations, join determinism marker (x-afiConstraints.timestampFreeSummary).
 */
export interface CanonicalHash3 {
  /**
   * Hash algorithm for off-chain canonical domains. v1 fixes this to sha256. keccak256 is reserved for on-chain domains and is intentionally NOT representable here.
   */
  algorithm: "sha256";
  /**
   * Version pin of the canonical serialization rules the digest was computed over (e.g. 'afi.hash.v1'). Distinct from the schema version of the hashed object.
   */
  canonicalizationVersion: string;
  /**
   * Domain-separation tag naming the off-chain domain the digest belongs to (e.g. 'afi.d2.signal-input', 'afi.d2.enrichment-bundle', 'afi.d2.scored-output'). Prevents cross-domain hash reuse.
   */
  domainTag: string;
  /**
   * The digest itself: 64 lowercase hex characters (SHA-256). Never a raw payload.
   */
  value: string;
  /**
   * OPTIONAL migration-compatibility pointer to a pre-District-2 hash value or reference (e.g. a USS v1.1 provenance.ingestHash). Non-authoritative; retained only so migrated records can be correlated.
   */
  legacyHashRef?: string;
}
/**
 * CanonicalHash v1 of the enrichment bundle this run produced (domain tag afi.d2.enrichment-bundle — the SAME domain as the provenance-record's optional enrichmentHash, made mandatory at the composition layer).
 */
export interface CanonicalHash4 {
  /**
   * Hash algorithm for off-chain canonical domains. v1 fixes this to sha256. keccak256 is reserved for on-chain domains and is intentionally NOT representable here.
   */
  algorithm: "sha256";
  /**
   * Version pin of the canonical serialization rules the digest was computed over (e.g. 'afi.hash.v1'). Distinct from the schema version of the hashed object.
   */
  canonicalizationVersion: string;
  /**
   * Domain-separation tag naming the off-chain domain the digest belongs to (e.g. 'afi.d2.signal-input', 'afi.d2.enrichment-bundle', 'afi.d2.scored-output'). Prevents cross-domain hash reuse.
   */
  domainTag: string;
  /**
   * The digest itself: 64 lowercase hex characters (SHA-256). Never a raw payload.
   */
  value: string;
  /**
   * OPTIONAL migration-compatibility pointer to a pre-District-2 hash value or reference (e.g. a USS v1.1 provenance.ingestHash). Non-authoritative; retained only so migrated records can be correlated.
   */
  legacyHashRef?: string;
}
