/* GENERATED FILE — DO NOT EDIT.
 * Derived from the vendored governed schema closure (src/governed-schema/)
 * by scripts/codegen.mjs (json-schema-to-typescript). Regenerate with
 * `npm run codegen`; freshness is enforced by tests/codegen-freshness.test.ts.
 */

/**
 * The canonical analyst strategy configuration (afi.analyst-strategy-config.v1): the SELECTION object that binds one canonical strategy identity triple (OBJ-GOV D-OBJ-3: analystId + strategyId + strategyVersion) to a pinned pipeline topology (pipelineRef with canonical manifestHash), a scorer plugin (scorerRef), a UWR scoring profile (uwrProfileRef), and a decay configuration (decayConfig), with bounded per-node overrides. It carries the CHOICES; the pipeline manifest carries the GRAPH. This is the object the resolution seam keys on to map an inbound signal to a strategy/pipeline.
 */
export interface AnalystStrategyConfig {
  /**
   * Schema-id version of the analyst strategy config.
   */
  schema: "afi.analyst-strategy-config.v1";
  /**
   * Canonical triple member (OBJ-GOV D-OBJ-3): the analyst identity, kept orthogonal to strategyId.
   */
  analystId: string;
  /**
   * Canonical triple member (OBJ-GOV D-OBJ-3): bare snake_case strategy slug with the embedded major-version token (e.g. trend_pullback_v1). The embedded major MUST match strategyVersion's major (x-afiConstraints.strategyIdMajorAgreement); the analyst name is never embedded.
   */
  strategyId: string;
  /**
   * Canonical triple member (OBJ-GOV D-OBJ-3): semver, NO v prefix (e.g. 1.0.0).
   */
  strategyVersion: string;
  /**
   * Pin of the exact pipeline topology this strategy runs: identity + canonical manifest hash (fail-closed on mismatch).
   */
  pipelineRef: {
    pipelineId: string;
    pipelineVersion: string;
    manifestHash: CanonicalHash;
  };
  /**
   * The scorer plugin identity. MUST agree with the referenced pipeline's single scorer node (x-afiConstraints.scorerAgreement).
   */
  scorerRef: {
    pluginId: string;
    pluginVersion: string;
  };
  /**
   * The UWR scoring profile this strategy scores under (e.g. a registries/uwr-profiles entry). Selection here is configuration only: recognition, qualification, and rewards remain separately governed (UP-10/UP-9/§6).
   */
  uwrProfileRef: {
    profileId: string;
  };
  /**
   * Decay selection: EITHER a reference to a governed decay template (ref.templateId, e.g. a GreeksDecayTemplate id) OR an inline surface (halfLifeMinutes > 0 + the greeksTemplateId it derives from). Exactly one form.
   */
  decayConfig:
    | {
        ref: {
          /**
           * Id of a governed decay template (e.g. decay-swing-v1).
           */
          templateId: string;
        };
      }
    | {
        inline: {
          /**
           * Half-life in minutes; strictly positive.
           */
          halfLifeMinutes: number;
          /**
           * The Greeks template family the inline surface derives from.
           */
          greeksTemplateId: string;
        };
      };
  /**
   * OPTIONAL bounded per-node overrides, keyed by node id of the referenced pipeline (x-afiConstraints.boundedOverrides). Only {enabled, config} are tunable — never topology.
   */
  nodeOverrides?: {
    [k: string]: {
      /**
       * Disable/enable the node (only admissible on nodes whose absence keeps the graph admissible; factory-validated).
       */
      enabled?: boolean;
      /**
       * Replacement node config; validated against the bound plugin's paramsSchema.
       */
      config?: {};
    };
  };
  /**
   * OPTIONAL free-form annotations; non-authoritative; EXCLUDED from canonical hash material (analystConfigHash).
   */
  metadata?: {};
}
/**
 * CanonicalHash v1 of the referenced afi.pipeline.v1 manifest (canonical-json-hashing.v1; description/metadata excluded).
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
