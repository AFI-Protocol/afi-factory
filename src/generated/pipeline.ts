/* GENERATED FILE — DO NOT EDIT.
 * Derived from the vendored governed schema closure (src/governed-schema/)
 * by scripts/codegen.mjs (json-schema-to-typescript). Regenerate with
 * `npm run codegen`; freshness is enforced by tests/codegen-freshness.test.ts.
 */

/**
 * Deterministic predicate tree. Exactly one operator per object: all/any (conjunction/disjunction over sub-predicates), not, exists(path), eq/ne (scalar equality), gt/gte/lt/lte (numeric ordering), in (path, values[]). Unknown operators and code strings are structurally rejected.
 */
export type Predicate =
  | {
      /**
       * @minItems 1
       */
      all: [Predicate, ...Predicate[]];
    }
  | {
      /**
       * @minItems 1
       */
      any: [Predicate, ...Predicate[]];
    }
  | {
      not: Predicate;
    }
  | {
      exists: Path;
    }
  | {
      eq: Comparison;
    }
  | {
      ne: Comparison;
    }
  | {
      gt: OrderedComparison;
    }
  | {
      gte: OrderedComparison;
    }
  | {
      lt: OrderedComparison;
    }
  | {
      lte: OrderedComparison;
    }
  | {
      in: {
        path: Path;
        /**
         * @minItems 1
         */
        values: [string | number | boolean | null, ...(string | number | boolean | null)[]];
      };
    };
/**
 * JSON-pointer-style path into validated node outputs (/nodes/<nodeId>/output/...) or pipeline context (/context/...). Non-empty segments only; never an expression.
 */
export type Path = string;

/**
 * The canonical pipeline topology contract for AFI analyst-configurable pipelines (afi.pipeline.v1). A pipeline manifest is a DECLARATIVE, deterministic description of a directed acyclic analysis graph: nodes (plugin-backed analysis stages in the seven governed categories) and edges (dataflow, optionally condition-gated by a schema-validated predicate tree). nodes/edges is the ONE topology representation: there is deliberately NO enrichmentNodes map and NO requiredNodes list (the retired ungoverned drafts' three overlapping mechanisms are collapsed into this single one). The manifest binds plugins by pluginId+pluginVersion ONLY — binding to code happens in the consuming runtime's build-time plugin registry; no filesystem paths are representable. Exactly one node of category 'scorer' terminates every admissible graph (the single scoring seam); graph-semantic invariants JSON Schema draft-07 cannot express are governed contract constraints in x-afiConstraints, enforced by the accompanying vector/tooling tests.
 */
export interface PipelineManifest {
  /**
   * Schema-id version of the pipeline manifest (OBJ-GOV D-OBJ-6 axis (a)).
   */
  schema: "afi.pipeline.v1";
  /**
   * Stable identifier of the pipeline topology (lowercase alphanumeric + hyphens). Registry key: one file per pipelineId+pipelineVersion under registries/pipelines/.
   */
  pipelineId: string;
  /**
   * Semantic version of this pipeline topology, WITH v prefix (v{major}.{minor}.{patch}). Any topology change requires a new version — never a mutation.
   */
  pipelineVersion: string;
  /**
   * OPTIONAL human-readable description. Annotational only — EXCLUDED from canonical hash material.
   */
  description?: string;
  /**
   * Node id of the single entry node. MUST name a declared node (x-afiConstraints.knownEndpoints); every node must be reachable from it.
   */
  entry: string;
  /**
   * The analysis stages of the graph. Node ids MUST be unique (x-afiConstraints.uniqueNodeIds). Structurally requires at least one 'scorer' node; exactly-one is a governed graph constraint.
   *
   * @minItems 1
   */
  nodes: [Node, ...Node[]];
  /**
   * Directed dataflow edges. The edge set MUST be acyclic and MUST make the scorer the only sink reachable from entry (x-afiConstraints).
   */
  edges: Edge[];
  /**
   * OPTIONAL free-form annotations (author, notes, provenance of authorship). NON-AUTHORITATIVE: nothing here may alter execution; EXCLUDED from canonical hash material.
   */
  metadata?: {};
}
export interface Node {
  /**
   * Unique node id within the manifest (lowercase alphanumeric + hyphens).
   */
  id: string;
  /**
   * Governed node category: the five code-canonical analysis categories (technical|pattern|sentiment|news|aiMl) plus 'merge' (structured join stage) and 'scorer' (the single scoring seam). No other categories exist in v1.
   */
  category: "technical" | "pattern" | "sentiment" | "news" | "aiMl" | "merge" | "scorer";
  /**
   * Id of the afi.analysis-plugin.v1 manifest implementing this node. Resolved against the runtime's build-time plugin registry — never a filesystem path.
   */
  pluginId: string;
  /**
   * Exact semver (NO v prefix) of the bound plugin manifest.
   */
  pluginVersion: string;
  /**
   * OPTIONAL node configuration. Open object at this layer; validated DOWNSTREAM against the bound plugin's paramsSchema (x-afiConstraints.configValidatedDownstream).
   */
  config?: {};
  /**
   * OPTIONAL per-node execution timeout in milliseconds (>= 1). Absent means the plugin's defaultTimeoutMs (or no timeout if that too is absent).
   */
  timeoutMs?: number;
  /**
   * OPTIONAL maximum retry count after the first attempt (>= 0).
   */
  maxRetries?: number;
  /**
   * OPTIONAL base delay between retries in milliseconds.
   */
  retryDelayMs?: number;
  /**
   * OPTIONAL retry backoff policy applied to retryDelayMs.
   */
  backoff?: "none" | "fixed" | "exponential";
  /**
   * Whether a failure of this node aborts the pipeline. Defaults to TRUE (fail-fast). Only critical:false nodes may declare failurePolicy 'degrade'.
   */
  critical?: boolean;
  /**
   * OPTIONAL failure policy: 'abort' fails the whole run; 'degrade' records the degradation and continues to the join — allowed ONLY when critical is explicitly false (bound structurally by if/then below).
   */
  failurePolicy?: "abort" | "degrade";
  /**
   * OPTIONAL operational resource limits for the node (open object; operational hints only, never scoring semantics).
   */
  resourceLimits?: {};
  join?: Join;
  providerInstanceRef?: ProviderInstanceRef;
}
/**
 * REQUIRED on (and only on) nodes with more than one incoming edge (x-afiConstraints.joinDeclaration). Declares the deterministic all-parents join and merge rule.
 */
export interface Join {
  /**
   * v1 fixes the join policy to 'all': the node runs when ALL non-optional parents have completed (optional parents that were skipped/degraded are joined as absent).
   */
  policy: "all";
  /**
   * Deterministic merge of parent outputs — deterministic by construction: strategy + conflictRule are both mandatory, so branch completion order can never change the merged value (MONGO-GOV D-MONGO-9).
   */
  merge: {
    /**
     * 'namespace-by-node': parent outputs are merged under their node ids (no key collisions possible). 'declared-fields': parent outputs contribute the fields declared by their plugin outputSchemaRef; collisions resolve via conflictRule.
     */
    strategy: "namespace-by-node" | "declared-fields";
    /**
     * 'error': any field collision fails the run. 'prefer:<nodeId>': collisions resolve to the named parent node's value; <nodeId> MUST be one of this node's parents (x-afiConstraints.joinDeclaration).
     */
    conflictRule: string;
  };
}
/**
 * OPTIONAL non-secret reference to a versioned provider instance (afi.provider-instance.v1) that supplies this category node's implementation (x-afiConstraints.providerInstanceRef). Identity + version ONLY — NEVER a credential value, secret, endpoint URL, or CredentialRef payload. Resolved BELOW the node by the runtime provider-adapter layer against deployment-local provider-instance configuration. Absent for in-registry keyless plugin nodes.
 */
export interface ProviderInstanceRef {
  /**
   * Stable id of the referenced afi.provider-instance.v1 record (deployment-local; not resolved in this contract).
   */
  providerInstanceId: string;
  /**
   * Exact semver of the referenced provider-instance record, version-pinned for deterministic composition.
   */
  recordVersion: string;
}
export interface Edge {
  /**
   * Source node id (must be declared in nodes).
   */
  from: string;
  /**
   * Target node id (must be declared in nodes).
   */
  to: string;
  /**
   * OPTIONAL named output port on the source node.
   */
  fromPort?: string;
  /**
   * OPTIONAL named input port on the target node.
   */
  toPort?: string;
  /**
   * OPTIONAL activation predicate: the edge fires only when the predicate evaluates true over validated node outputs / pipeline context. Pure data (predicate tree) — code strings are structurally rejected.
   */
  condition?:
    | {
        /**
         * @minItems 1
         */
        all: [Predicate, ...Predicate[]];
      }
    | {
        /**
         * @minItems 1
         */
        any: [Predicate, ...Predicate[]];
      }
    | {
        not: Predicate;
      }
    | {
        exists: Path;
      }
    | {
        eq: Comparison;
      }
    | {
        ne: Comparison;
      }
    | {
        gt: OrderedComparison;
      }
    | {
        gte: OrderedComparison;
      }
    | {
        lt: OrderedComparison;
      }
    | {
        lte: OrderedComparison;
      }
    | {
        in: {
          path: Path;
          /**
           * @minItems 1
           */
          values: [string | number | boolean | null, ...(string | number | boolean | null)[]];
        };
      };
  /**
   * OPTIONAL marker that this edge's parent is optional for a downstream join: if the parent was skipped (condition false) or degraded, the join proceeds without it instead of waiting/failing.
   */
  optional?: boolean;
}
export interface Comparison {
  path: Path;
  /**
   * Scalar comparison operand (objects/arrays are not comparable operands in v1).
   */
  value: string | number | boolean | null;
}
export interface OrderedComparison {
  path: Path;
  /**
   * Numeric operand for ordering comparisons.
   */
  value: number;
}
