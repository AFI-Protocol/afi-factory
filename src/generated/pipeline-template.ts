/* GENERATED FILE — DO NOT EDIT.
 * Derived from the vendored governed schema closure (src/governed-schema/)
 * by scripts/codegen.mjs (json-schema-to-typescript). Regenerate with
 * `npm run codegen`; freshness is enforced by tests/codegen-freshness.test.ts.
 */

export type NodeId = string;
/**
 * The afi.pipeline.v1 predicate tree with slots admissible as comparison operands, or a whole-condition slot.
 */
export type TemplatePredicate =
  | ParamSlot
  | {
      /**
       * @minItems 1
       */
      all: [TemplatePredicate, ...TemplatePredicate[]];
    }
  | {
      /**
       * @minItems 1
       */
      any: [TemplatePredicate, ...TemplatePredicate[]];
    }
  | {
      not: TemplatePredicate;
    }
  | {
      exists: Path;
    }
  | {
      eq: TemplateComparison;
    }
  | {
      ne: TemplateComparison;
    }
  | {
      gt: TemplateOrderedComparison;
    }
  | {
      gte: TemplateOrderedComparison;
    }
  | {
      lt: TemplateOrderedComparison;
    }
  | {
      lte: TemplateOrderedComparison;
    }
  | {
      in: {
        path: Path;
        values: [ScalarOrSlot, ...ScalarOrSlot[]] | ParamSlot;
      };
    };
export type Path = string;
export type ScalarOrSlot = (string | number | boolean | null) | ParamSlot;
export type NumberOrSlot = number | ParamSlot;

/**
 * A pipeline TEMPLATE (afi.pipeline-template.v1) is the afi.pipeline.v1 shape plus templateId + templateVersion + a declared parameters[] list, with substitution points expressed as {"$param":"<name>"} value slots anywhere a concrete value is legal. The Factory INSTANTIATES a template by resolving every slot against caller-supplied parameter values (validated against each parameter's inline JSON-schema fragment, defaults applied) and emitting a concrete afi.pipeline.v1 manifest, which MUST then pass the full pipeline contract (schema + graph constraints). Templates are authoring artifacts only: nothing executes a template.
 */
export interface PipelineTemplate {
  /**
   * Schema-id version of the pipeline template.
   */
  schema: "afi.pipeline-template.v1";
  /**
   * Stable identifier of the template.
   */
  templateId: string;
  /**
   * Semantic version of the template (WITH v prefix). New version per change, never mutation.
   */
  templateVersion: string;
  /**
   * Declared substitution parameters. Every {"$param":"<name>"} slot in the template must reference one of these names (x-afiConstraints.declaredSlots).
   */
  parameters: Parameter[];
  /**
   * pipelineId of the instantiated pipeline (concrete — identity is never parameterized).
   */
  pipelineId: string;
  /**
   * pipelineVersion of the instantiated pipeline (concrete).
   */
  pipelineVersion: string;
  /**
   * OPTIONAL annotation; excluded from canonical hash material.
   */
  description?: string;
  /**
   * Entry node id of the instantiated pipeline (concrete).
   */
  entry: string;
  /**
   * Template nodes: the afi.pipeline.v1 node shape with {"$param":...} slots admissible wherever a concrete tunable value is legal.
   *
   * @minItems 1
   */
  nodes: [TemplateNode, ...TemplateNode[]];
  /**
   * Template edges: the afi.pipeline.v1 edge shape; condition operands may be slots.
   */
  edges: TemplateEdge[];
  /**
   * OPTIONAL free-form annotations; non-authoritative; excluded from canonical hash material.
   */
  metadata?: {};
}
export interface Parameter {
  /**
   * Parameter name referenced by {"$param":"<name>"} slots. Unique within the template.
   */
  name: string;
  /**
   * Inline JSON Schema (draft-07) fragment the supplied value must validate against at instantiation time.
   */
  schema: {};
  /**
   * Whether a value MUST be supplied at instantiation (true and no default => fail closed when absent).
   */
  required: boolean;
  /**
   * OPTIONAL default value applied when the parameter is not supplied. Must itself validate against the parameter's schema fragment.
   */
  default?: {
    [k: string]: unknown;
  };
  /**
   * OPTIONAL human-readable purpose of the parameter.
   */
  description?: string;
}
export interface TemplateNode {
  id: NodeId;
  category: "technical" | "pattern" | "sentiment" | "news" | "aiMl" | "merge" | "scorer";
  /**
   * Concrete plugin binding (never a slot — topology and binding are concrete).
   */
  pluginId: string;
  /**
   * Exact plugin semver, or a slot resolving to one.
   */
  pluginVersion: string | ParamSlot;
  /**
   * OPTIONAL node configuration. Slots are admissible anywhere inside (resolved recursively at instantiation); the resolved object is validated downstream against the plugin's paramsSchema.
   */
  config?: {};
  timeoutMs?: number | ParamSlot;
  maxRetries?: number | ParamSlot;
  retryDelayMs?: number | ParamSlot;
  backoff?: ("none" | "fixed" | "exponential") | ParamSlot;
  critical?: boolean | ParamSlot;
  /**
   * The degrade-only-when-critical:false coupling binds the INSTANTIATED pipeline (afi.pipeline.v1 enforces it structurally).
   */
  failurePolicy?: ("abort" | "degrade") | ParamSlot;
  /**
   * OPTIONAL operational resource limits; slots admissible inside.
   */
  resourceLimits?: {};
  /**
   * Concrete join declaration (never a slot — determinism of the join is structural).
   */
  join?: {
    policy: "all";
    merge: {
      strategy: "namespace-by-node" | "declared-fields";
      conflictRule: string;
    };
  };
}
/**
 * A substitution point: {"$param":"<name>"} stands anywhere a concrete tunable value is legal.
 */
export interface ParamSlot {
  /**
   * Name of a declared parameter whose resolved value replaces this slot at instantiation.
   */
  $param: string;
}
export interface TemplateEdge {
  from: NodeId;
  to: NodeId;
  fromPort?: string;
  toPort?: string;
  condition?: TemplatePredicate;
  optional?: boolean;
}
export interface TemplateComparison {
  path: Path;
  value: ScalarOrSlot;
}
export interface TemplateOrderedComparison {
  path: Path;
  value: NumberOrSlot;
}
