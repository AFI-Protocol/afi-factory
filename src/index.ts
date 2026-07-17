/**
 * afi-factory — the AFI pipeline authoring system (SLOT-FCP-FACTORY).
 *
 * Replaceable authoring implementation per D-FCP-4
 * (afi-governance/decisions/factory-configurable-pipelines-v1.md): template
 * authoring + instantiation, manifest validation, canonical hashing
 * (D-FCP-6 identity rules), graph inspection, and plugin scaffolding for the
 * governed afi.pipeline.v1 contract family, validated against the vendored,
 * byte-pinned afi-config schema closure (src/governed-schema/).
 *
 * NOT a protocol authority and NOT the live executor: nothing this library
 * emits is canonical until validated against the delegated afi-config
 * contracts, and nothing here executes a pipeline.
 */

// Generated contract types (codegen from the vendored governed schemas).
export type { PipelineManifest, Node, Edge, Join, Predicate } from './generated/pipeline.js';
export type { PipelineTemplate, Parameter, ParamSlot, TemplateNode, TemplateEdge } from './generated/pipeline-template.js';
export type { AnalysisPluginManifest } from './generated/analysis-plugin.js';
export type { AnalystStrategyConfig } from './generated/analyst-strategy-config.js';
export type { AnalystStrategyRegistration } from './generated/analyst-strategy-registration.js';
export type { ProviderStrategyBinding, StrategyTriple } from './generated/provider-strategy-binding.js';
export type { CompositionRef } from './generated/composition-ref.js';
export type { CanonicalHash } from './generated/canonical-hash.js';

// Canonical hashing (canonical-json-hashing.v1; KAT-proven).
export {
  CANONICALIZATION_VERSION,
  DOMAIN_TAGS,
  EXCLUDED_FIELDS,
  canonicalize,
  sha256Hex,
  stripExcluded,
  canonicalHashOf,
  manifestHash,
  analystConfigHash,
  pluginSetHash,
} from './canonical-json.js';

// Schema layer (strict AJV over the vendored closure).
export {
  ARTIFACT_KINDS,
  KIND_TO_SCHEMA_ID,
  createAjv,
  createFragmentAjv,
  loadGovernedSchema,
  validateAgainstSchema,
  detectKind,
  type ArtifactKind,
  type ValidationIssue,
  type SchemaValidationResult,
} from './schemas.js';

// Graph semantics (afi-config-mirrored) + plugin binding checks.
export {
  graphInfo,
  pipelineGraphViolations,
  pluginBindingViolations,
  indexPluginSet,
  type GraphInfo,
  type PluginSet,
} from './graph.js';

// Template semantics + instantiation.
export { templateViolations, instantiateTemplate, type InstantiationResult } from './template.js';

// Analyst-config semantics + cross-artifact checks.
export { analystConfigViolations, analystConfigCrossViolations } from './analyst-config.js';

// Loading + full validation.
export {
  loadAndValidate,
  validateDocument,
  semanticViolations,
  type LoadAndValidateOptions,
  type LoadAndValidateResult,
} from './loader.js';

// Inspection.
export {
  inspectPipeline,
  renderInspection,
  type PipelineInspection,
  type NodeRow,
  type JoinSummary,
  type ConditionSummary,
} from './inspect.js';

// Scaffolding.
export { scaffoldPluginManifest, scaffoldPluginContract, CATEGORIES, type PluginCategory } from './scaffold.js';
