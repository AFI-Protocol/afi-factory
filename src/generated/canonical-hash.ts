/* GENERATED FILE — DO NOT EDIT.
 * Derived from the vendored governed schema closure (src/governed-schema/)
 * by scripts/codegen.mjs (json-schema-to-typescript). Regenerate with
 * `npm run codegen`; freshness is enforced by tests/codegen-freshness.test.ts.
 */

/**
 * DRAFT / NON-IMPLEMENTATION structural spec for canonical hash references in off-chain AFI domains. Fixes the reference shape only (algorithm, canonicalization version, domain tag, digest value); it does NOT implement hashing, canonicalization, or verification. EXPLICIT SEPARATION: this object covers off-chain sha256 domains only. On-chain keccak256 domains (settlement anchoring, EAS commitments, contract-facing digests) are a separate domain family and MUST NOT be represented with this object.
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
