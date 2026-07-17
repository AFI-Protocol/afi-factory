/**
 * TEMPORARY SEQUENCING SHIM — kept only so afi-reactor main compiles until
 * SLOT-FCP-REACTOR/CLEANUP; scheduled for removal under SLOT-FCP-CLEANUP;
 * do not use.
 *
 * The types below describe the RETIRED ungoverned draft contracts
 * (afi-config analyst-config/enrichment-node drafts). The governed
 * replacements are the afi.pipeline.v1 contract family vendored under
 * src/governed-schema/ and typed under src/generated/.
 */
/**
 * AFI Factory - Analyst Configuration Types
 *
 * This file defines TypeScript interfaces for analyst configurations,
 * bridging afi-config schemas with afi-reactor orchestration.
 *
 * These interfaces are strongly typed and compatible with the JSON schemas
 * defined in afi-config/schemas/analyst-config.schema.json and
 * afi-config/schemas/definitions/enrichment-node.schema.json.
 *
 * @module afi-factory/schemas/index
 */

/**
 * Enrichment node configuration
 *
 * Defines the configuration for a single enrichment node in the analyst pipeline.
 * Enrichment nodes are processing units that transform, analyze, or augment signals.
 *
 * @see afi-config/schemas/definitions/enrichment-node.schema.json
 */
export interface EnrichmentNodeConfig {
  /** Unique identifier for the enrichment node. Must be lowercase alphanumeric with hyphens only. */
  id: string;

  /** Type of node: 'enrichment' nodes transform or augment signals, 'ingress' nodes bring external data into the pipeline. */
  type: 'enrichment' | 'ingress';

  /** Identifier of the plugin that implements this enrichment node. Must reference a registered plugin in the AFI plugin registry. */
  plugin: string;

  /** Whether this enrichment node is active and should be executed during pipeline processing. Disabled nodes are skipped. */
  enabled: boolean;

  /** Whether this enrichment node is optional. Optional nodes that fail will not cause pipeline failure. Non-optional nodes that fail will halt pipeline execution. */
  optional?: boolean;

  /** Whether this enrichment node can be executed in parallel with other nodes. Parallel nodes can improve pipeline throughput for independent operations. */
  parallel?: boolean;

  /** List of enrichment node IDs that this node depends on. The pipeline will ensure all dependencies complete before executing this node. */
  dependencies?: string[];

  /** Plugin-specific configuration for this enrichment node. The structure depends on the plugin implementation. */
  config?: Record<string, unknown>;
}

/**
 * Analyst configuration metadata
 *
 * Optional metadata about the analyst configuration for documentation and tracking purposes.
 */
export interface AnalystConfigMetadata {
  /** Human-readable description of the analyst's purpose and capabilities. */
  description?: string;

  /** Author or creator of the analyst configuration. */
  author?: string;

  /** ISO 8601 timestamp when the configuration was created. */
  createdAt?: string;

  /** ISO 8601 timestamp when the configuration was last updated. */
  updatedAt?: string;
}

/**
 * Analyst configuration
 *
 * Defines the complete configuration for an analyst agent within the AFI ecosystem.
 * Analyst configurations define the enrichment nodes and processing pipeline for a specific analyst.
 *
 * @see afi-config/schemas/analyst-config.schema.json
 */
export interface AnalystConfig {
  /** Unique identifier for the analyst. Must be lowercase alphanumeric with hyphens only. */
  analystId: string;

  /** Semantic version of the analyst configuration. Follows the pattern v{major}.{minor}.{patch}. */
  version?: string;

  /** Array of enrichment nodes that define the processing pipeline for this analyst. */
  enrichmentNodes: EnrichmentNodeConfig[];

  /** Optional metadata about the analyst configuration. */
  metadata?: AnalystConfigMetadata;
}

/**
 * Analyst configuration with validation result
 *
 * Extends AnalystConfig with validation status and any errors or warnings.
 */
export interface ValidatedAnalystConfig extends AnalystConfig {
  /** Whether the configuration is valid according to the schema. */
  valid: boolean;

  /** Validation errors (if any). Empty array if configuration is valid. */
  errors?: string[];

  /** Validation warnings (if any). Warnings indicate potential issues but do not prevent configuration from being used. */
  warnings?: string[];
}

/**
 * Template registry entry
 *
 * Represents an entry in the template registry for tracking analyst configurations,
 * enrichment nodes, and plugins.
 */
export interface TemplateRegistryEntry {
  /** Template ID. */
  id: string;

  /** Template type. */
  type: 'analyst-config' | 'enrichment-node' | 'plugin';

  /** Template path (file system path or URL). */
  path: string;

  /** Schema ID for validation (e.g., 'https://afi-protocol.org/schemas/analyst-config.schema.json'). */
  schemaId?: string;

  /** Template version. */
  version?: string;
}

/**
 * Load options for analyst configuration
 *
 * Options for loading analyst configurations from the template registry.
 */
export interface LoadAnalystConfigOptions {
  /** Whether to validate against schema (default: true). */
  validate?: boolean;

  /** Whether to cache the result (default: true). */
  cache?: boolean;

  /** Custom configuration directory (default: './analyst-configs'). */
  configDir?: string;
}

/**
 * Type guard to check if an object is an EnrichmentNodeConfig
 */
export function isEnrichmentNodeConfig(obj: unknown): obj is EnrichmentNodeConfig {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const config = obj as unknown as Record<string, unknown>;

  return (
    typeof config.id === 'string' &&
    (config.type === 'enrichment' || config.type === 'ingress') &&
    typeof config.plugin === 'string' &&
    typeof config.enabled === 'boolean'
  );
}

/**
 * Type guard to check if an object is an AnalystConfig
 */
export function isAnalystConfig(obj: unknown): obj is AnalystConfig {
  if (typeof obj !== 'object' || obj === null) {
    return false;
  }

  const config = obj as unknown as Record<string, unknown>;

  return (
    typeof config.analystId === 'string' &&
    Array.isArray(config.enrichmentNodes) &&
    config.enrichmentNodes.every(isEnrichmentNodeConfig)
  );
}

/**
 * Type guard to check if an object is a ValidatedAnalystConfig
 */
export function isValidatedAnalystConfig(obj: unknown): obj is ValidatedAnalystConfig {
  if (!isAnalystConfig(obj)) {
    return false;
  }

  const config = obj as unknown as Record<string, unknown>;

  return (
    typeof config.valid === 'boolean' &&
    (config.errors === undefined || Array.isArray(config.errors)) &&
    (config.warnings === undefined || Array.isArray(config.warnings))
  );
}
