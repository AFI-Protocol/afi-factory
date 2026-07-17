/* GENERATED FILE — DO NOT EDIT.
 * Derived from the vendored governed schema closure (src/governed-schema/)
 * by scripts/codegen.mjs (json-schema-to-typescript). Regenerate with
 * `npm run codegen`; freshness is enforced by tests/codegen-freshness.test.ts.
 */

/**
 * The canonical registry ENTRY (afi.analyst-strategy-registration.v1) recording that one analyst strategy configuration is registered: the canonical strategy identity triple, the canonical hash of the exact afi.analyst-strategy-config.v1 object (analystConfigHash), an immutable reference to where that config lives (configRef), the provider binding policy governing WHICH providers may route signals into this strategy, an active/inactive status, the administrative registration date, and the registration decision/PR pointer. One JSON file per identity under registries/analyst-strategies/.
 */
export interface AnalystStrategyRegistration {
  /**
   * Schema-id version of the registry entry.
   */
  schema: "afi.analyst-strategy-registration.v1";
  /**
   * Canonical triple member (OBJ-GOV D-OBJ-3).
   */
  analystId: string;
  /**
   * Canonical triple member: bare snake_case slug with embedded major token; major must match strategyVersion (x-afiConstraints).
   */
  strategyId: string;
  /**
   * Canonical triple member: semver, NO v prefix.
   */
  strategyVersion: string;
  analystConfigHash: CanonicalHash;
  /**
   * Immutable reference to the registered config artifact (repo path or content-addressed ref), e.g. 'afi-config/examples/analyst-strategy-config/v1/....json' or a pinned git object ref. MUST resolve and hash-match (x-afiConstraints.configResolution).
   */
  configRef: string;
  /**
   * Which providers may route signals into this strategy. 'explicit' enumerates binding ids; 'any-authenticated' admits any authenticated provider binding.
   */
  providerBindingPolicy: {
    mode: "explicit" | "any-authenticated";
    /**
     * REQUIRED when mode is 'explicit' (bound structurally by if/then below); forbidden semantics otherwise are advisory (ignored under any-authenticated).
     *
     * @minItems 1
     */
    allowedBindings?: [string, ...string[]];
  };
  /**
   * Registry status. Only 'active' entries are resolvable at runtime; 'inactive' retires without deletion (supersession discipline).
   */
  status: "active" | "inactive";
  /**
   * ADMINISTRATIVE registration date (YYYY-MM-DD). Excluded from canonical hash material (x-afiConstraints.hashExclusions).
   */
  registeredAt: string;
  /**
   * Pointer to the registering act (PR URL/number or decision reference).
   */
  registrationRef: string;
}
/**
 * CanonicalHash v1 of the exact registered afi.analyst-strategy-config.v1 object (domain tag afi.factory.analyst-config; metadata excluded). The immutable pin the runtime verifies before composing.
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
