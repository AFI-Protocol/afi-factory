/* GENERATED FILE — DO NOT EDIT.
 * Derived from the vendored governed schema closure (src/governed-schema/)
 * by scripts/codegen.mjs (json-schema-to-typescript). Regenerate with
 * `npm run codegen`; freshness is enforced by tests/codegen-freshness.test.ts.
 */

/**
 * The canonical MANIFEST of one analysis plugin (afi.analysis-plugin.v1): the declarative contract a pipeline node binds by pluginId+pluginVersion. It declares the plugin's category, input/output schema references, determinism, capabilities (provider/secret requirements), execution defaults, permitted failure policies, its inline paramsSchema (the JSON Schema that validates a node's config), multi-instance admissibility, category-level ordering constraints, and whether its output may feed the scorer. It deliberately contains NO filesystem paths and NO code references: binding a manifest to code happens in the consuming runtime's BUILD-TIME plugin registry keyed by pluginId+pluginVersion.
 */
export interface AnalysisPluginManifest {
  /**
   * Schema-id version of the plugin manifest.
   */
  schema: "afi.analysis-plugin.v1";
  /**
   * Stable plugin identifier (lowercase alphanumeric + hyphens). Registry key together with pluginVersion.
   */
  pluginId: string;
  /**
   * Semver (NO v prefix) of this manifest's CONTRACT surface. Bumped whenever the declared contract changes.
   */
  pluginVersion: string;
  /**
   * Version identity of the CODE realizing this contract (e.g. a package version or build identifier). Distinct axis from pluginVersion: an implementation fix that preserves the contract bumps only this.
   */
  implementationVersion: string;
  /**
   * Governed plugin category: the five analysis categories plus merge and scorer. A pipeline node may bind only a plugin of its own category.
   */
  category: "technical" | "pattern" | "sentiment" | "news" | "aiMl" | "merge" | "scorer";
  /**
   * OPTIONAL human-readable description; excluded from canonical hash material.
   */
  description?: string;
  /**
   * Identifier of the schema the plugin's input payload conforms to (afi.* schema id or afi-protocol.org schema URL). NEVER a filesystem path.
   */
  inputSchemaRef: string;
  /**
   * Identifier of the schema the plugin's output payload conforms to. NEVER a filesystem path.
   */
  outputSchemaRef: string;
  /**
   * TRUE iff the plugin is a pure function of its validated input + config (no external I/O, no clock, no randomness). External-provider plugins MUST declare false.
   */
  deterministic: boolean;
  /**
   * OPTIONAL declared requirement classes. Never secret values (x-afiConstraints.capabilitiesAreRequirements).
   */
  capabilities?: string[];
  /**
   * OPTIONAL default per-invocation timeout applied when the pipeline node declares none.
   */
  defaultTimeoutMs?: number;
  /**
   * OPTIONAL default retry policy applied when the pipeline node declares none.
   */
  defaultRetryPolicy?: {
    maxRetries: number;
    retryDelayMs?: number;
    backoff?: "none" | "fixed" | "exponential";
  };
  /**
   * OPTIONAL whitelist of failure policies a node binding this plugin may declare. Absent means only 'abort'. Composition tooling rejects a node declaring a policy outside this set.
   *
   * @minItems 1
   */
  permittedFailurePolicies?: ["abort" | "degrade", ...("abort" | "degrade")[]];
  /**
   * REQUIRED inline JSON Schema (draft-07) fragment that validates a binding node's config. Use {} (permit-all) only for genuinely configuration-free plugins; the factory validates every node.config against this before accepting a composition.
   */
  paramsSchema: {};
  /**
   * Whether one pipeline may bind this plugin on MULTIPLE nodes (e.g. two news nodes with different windows). Defaults false: composition tooling rejects repeated binding unless declared true.
   */
  multiInstance?: boolean;
  /**
   * OPTIONAL category-level ordering hints enforced by factory composition validation (x-afiConstraints.orderingScope).
   */
  orderingConstraints?: {
    mustRunBefore?: ("technical" | "pattern" | "sentiment" | "news" | "aiMl" | "merge" | "scorer")[];
    mustRunAfter?: ("technical" | "pattern" | "sentiment" | "news" | "aiMl" | "merge" | "scorer")[];
  };
  /**
   * REQUIRED declaration of whether this plugin's output is admissible as scorer input (x-afiConstraints.scorerFeed). Category 'scorer' plugins declare false (a scorer never feeds another scorer — it is the sink).
   */
  mayFeedScorer: boolean;
  /**
   * OPTIONAL free-form annotations; non-authoritative; excluded from canonical hash material.
   */
  metadata?: {};
}
