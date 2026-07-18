/**
 * SEMANTIC graph validation for afi.pipeline.v1 manifests — the governed
 * graph constraints JSON Schema draft-07 cannot express (the pipeline
 * contract's x-afiConstraints), mirroring the afi-config test-suite semantics
 * (afi-config tests/pipeline-schema-validation.test.ts) exactly:
 *
 *   unique node ids; known edge endpoints (entry + from/to, no self-edges);
 *   Kahn acyclicity; exactly one scorer; scorer is a reachable,
 *   non-bypassable sink (every node reachable from entry; scorer the only
 *   sink); join declared iff in-degree > 1; prefer:<nodeId> conflict rules
 *   name a parent.
 *
 * Plus the factory-side checks the contracts delegate to composition tooling:
 * condition-path well-formedness, timeout/retry bound re-checks, and — when a
 * plugin-manifest set is provided — category/plugin binding checks (unknown
 * pluginId/version = error), node.config validation against the bound
 * plugin's paramsSchema (unbound required params = error), permitted failure
 * policies, multiInstance, mayFeedScorer, and category-level ordering
 * constraints.
 */
import type { PipelineManifest, Node as PipelineNode } from './generated/pipeline.js';
import type { AnalysisPluginManifest } from './generated/analysis-plugin.js';
import { createFragmentAjv, type ValidationIssue } from './schemas.js';

export interface GraphInfo {
  ids: string[];
  out: Map<string, string[]>;
  parents: Map<string, string[]>;
  reachable: Set<string>;
  /** Kahn levels: wave i can execute concurrently once wave i-1 completed. */
  waves: string[][];
  /** Deterministic topological order (stable by node declaration order). */
  order: string[];
}

/** Builds adjacency + reachability + Kahn levels for a structurally readable manifest. */
export function graphInfo(p: PipelineManifest): GraphInfo {
  const ids = p.nodes.map((n) => n.id);
  const idSet = new Set(ids);
  const uniqueIds = [...idSet];
  const out = new Map<string, string[]>();
  const parents = new Map<string, string[]>();
  uniqueIds.forEach((id) => {
    out.set(id, []);
    parents.set(id, []);
  });
  for (const e of p.edges) {
    if (idSet.has(e.from) && idSet.has(e.to) && e.from !== e.to) {
      out.get(e.from)!.push(e.to);
      parents.get(e.to)!.push(e.from);
    }
  }
  const reachable = new Set<string>();
  if (idSet.has(p.entry)) {
    reachable.add(p.entry);
    const stack = [p.entry];
    while (stack.length) {
      for (const m of out.get(stack.pop()!)!) {
        if (!reachable.has(m)) {
          reachable.add(m);
          stack.push(m);
        }
      }
    }
  }
  // Kahn levels + deterministic topological order (declaration-order stable).
  const indeg = new Map<string, number>();
  uniqueIds.forEach((id) => indeg.set(id, parents.get(id)!.length));
  const waves: string[][] = [];
  const order: string[] = [];
  let frontier = uniqueIds.filter((id) => indeg.get(id) === 0);
  while (frontier.length) {
    waves.push(frontier);
    order.push(...frontier);
    const next: string[] = [];
    for (const n of frontier) {
      for (const m of out.get(n)!) {
        indeg.set(m, indeg.get(m)! - 1);
        if (indeg.get(m) === 0) next.push(m);
      }
    }
    // keep declaration order within a wave
    frontier = uniqueIds.filter((id) => next.includes(id));
  }
  return { ids, out, parents, reachable, waves, order };
}

const PATH_WELL_FORMED = /^\/(context(\/[A-Za-z0-9_.-]+)+|nodes\/([a-z0-9-]+)\/output(\/[A-Za-z0-9_.-]+)*)$/;

function collectConditionPaths(condition: unknown, found: string[] = []): string[] {
  if (Array.isArray(condition)) {
    condition.forEach((c) => collectConditionPaths(c, found));
    return found;
  }
  if (condition && typeof condition === 'object') {
    for (const [k, v] of Object.entries(condition)) {
      if ((k === 'exists' || k === 'path') && typeof v === 'string') found.push(v);
      else collectConditionPaths(v, found);
    }
  }
  return found;
}

/**
 * The afi-config-mirrored graph-semantic layer. Returns [] iff the graph is
 * clean. Every issue carries a JSON-pointer into the manifest.
 */
export function pipelineGraphViolations(p: unknown): ValidationIssue[] {
  const v: ValidationIssue[] = [];
  const issue = (pointer: string, message: string) => v.push({ pointer, message });
  const doc = p as PipelineManifest;
  if (
    !doc ||
    typeof doc !== 'object' ||
    !Array.isArray((doc as { nodes?: unknown }).nodes) ||
    !Array.isArray((doc as { edges?: unknown }).edges)
  ) {
    return [{ pointer: '', message: 'manifest is not structurally readable' }];
  }

  const nodes = doc.nodes.filter((n) => n && typeof n === 'object');
  const ids = nodes.map((n) => n.id);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) {
    const seen = new Set<string>();
    nodes.forEach((n, i) => {
      if (seen.has(n.id)) issue(`/nodes/${i}/id`, `duplicate node id '${n.id}'`);
      seen.add(n.id);
    });
  }

  const edges = doc.edges.filter((e) => e && typeof e === 'object');
  edges.forEach((e, i) => {
    if (!idSet.has(e.from)) issue(`/edges/${i}/from`, `edge.from names unknown node '${e.from}'`);
    if (!idSet.has(e.to)) issue(`/edges/${i}/to`, `edge.to names unknown node '${e.to}'`);
    if (e.from === e.to) issue(`/edges/${i}`, `self-edge on '${e.from}'`);
  });
  if (!idSet.has(doc.entry)) issue('/entry', `entry names unknown node '${doc.entry}'`);

  const g = graphInfo(doc);

  // Acyclicity (Kahn): every unique node must appear in the level order.
  if (g.order.length < idSet.size) issue('/edges', 'cycle detected');

  // Exactly one scorer (schema requires >= 1 structurally; cap enforced here).
  const scorers = nodes.filter((n) => n.category === 'scorer');
  if (scorers.length === 0) issue('/nodes', 'zero scorer nodes');
  if (scorers.length > 1) issue('/nodes', 'multiple scorer nodes');

  // Reachability + scorer terminality / non-bypassability.
  if (idSet.has(doc.entry)) {
    nodes.forEach((n, i) => {
      if (!g.reachable.has(n.id)) issue(`/nodes/${i}`, `node '${n.id}' unreachable from entry`);
    });
    if (scorers.length === 1) {
      const scorerId = scorers[0].id;
      if ((g.out.get(scorerId) ?? []).length > 0) issue('/nodes', 'scorer is not a sink');
      if (!g.reachable.has(scorerId)) issue('/nodes', 'scorer not reachable from entry');
      [...g.reachable]
        .filter((id) => (g.out.get(id) ?? []).length === 0)
        .forEach((sink) => {
          if (sink !== scorerId)
            issue('/nodes', `non-scorer sink '${sink}' reachable from entry (scorer bypass)`);
        });
    }
  }

  // Join declaration rules: in-degree > 1 <=> join declared; prefer: names a parent.
  nodes.forEach((n, i) => {
    const indegree = (g.parents.get(n.id) ?? []).length;
    if (indegree > 1 && !n.join)
      issue(`/nodes/${i}`, `node '${n.id}' has ${indegree} parents but declares no join`);
    if (indegree <= 1 && n.join)
      issue(`/nodes/${i}/join`, `node '${n.id}' declares join with ${indegree} parent(s)`);
    const rule = n.join?.merge?.conflictRule;
    if (typeof rule === 'string' && rule.startsWith('prefer:')) {
      const target = rule.slice('prefer:'.length);
      if (!(g.parents.get(n.id) ?? []).includes(target)) {
        issue(
          `/nodes/${i}/join/merge/conflictRule`,
          `join conflictRule '${rule}' does not name a parent of '${n.id}'`
        );
      }
    }
  });

  // Condition paths must be well-formed: /context/... or /nodes/<declared>/output/...
  edges.forEach((e, i) => {
    if (!e.condition) return;
    for (const path of collectConditionPaths(e.condition)) {
      const m = PATH_WELL_FORMED.exec(path);
      if (!m) {
        issue(
          `/edges/${i}/condition`,
          `condition path '${path}' is not well-formed (/context/... or /nodes/<nodeId>/output/...)`
        );
      } else if (m[3] && !idSet.has(m[3])) {
        issue(`/edges/${i}/condition`, `condition path '${path}' references undeclared node '${m[3]}'`);
      }
    }
  });

  // Timeout/retry bound re-checks (contract bounds, re-verified semantically).
  nodes.forEach((n, i) => {
    if (n.timeoutMs !== undefined && (!Number.isInteger(n.timeoutMs) || n.timeoutMs < 1))
      issue(`/nodes/${i}/timeoutMs`, `timeoutMs must be an integer >= 1 (got ${n.timeoutMs})`);
    if (n.maxRetries !== undefined && (!Number.isInteger(n.maxRetries) || n.maxRetries < 0))
      issue(`/nodes/${i}/maxRetries`, `maxRetries must be an integer >= 0 (got ${n.maxRetries})`);
    if (n.retryDelayMs !== undefined && (!Number.isInteger(n.retryDelayMs) || n.retryDelayMs < 0))
      issue(`/nodes/${i}/retryDelayMs`, `retryDelayMs must be an integer >= 0 (got ${n.retryDelayMs})`);
    if (n.failurePolicy === 'degrade' && n.critical !== false)
      issue(`/nodes/${i}/failurePolicy`, `failurePolicy 'degrade' requires explicit critical:false`);
  });

  // providerInstanceRef (PBF-GOV D-PBF-4): a non-secret reference to a
  // provider-instance that supplies a CATEGORY lane. It is admissible only on
  // the five analysis categories — never on the structured merge join or the
  // single scorer seam (a provider instance configures one analysis category,
  // not the join/scoring stages). The schema already forbids it from carrying a
  // credential value; this is the category-compatibility check.
  nodes.forEach((n, i) => {
    if (n.providerInstanceRef && (n.category === 'merge' || n.category === 'scorer')) {
      issue(
        `/nodes/${i}/providerInstanceRef`,
        `providerInstanceRef is not admissible on a '${n.category}' node (a provider instance supplies an analysis category only)`
      );
    }
  });

  return v;
}

/** A resolvable plugin-manifest set, keyed by pluginId@pluginVersion. */
export type PluginSet = ReadonlyArray<AnalysisPluginManifest>;

function pluginKey(pluginId: string, pluginVersion: string): string {
  return `${pluginId}@${pluginVersion}`;
}

export function indexPluginSet(plugins: PluginSet): Map<string, AnalysisPluginManifest> {
  const map = new Map<string, AnalysisPluginManifest>();
  for (const p of plugins) map.set(pluginKey(p.pluginId, p.pluginVersion), p);
  return map;
}

/**
 * Category/plugin binding checks against a provided plugin-manifest set.
 * An unknown pluginId/version is an ERROR (fail closed — D-FCP-5 posture).
 */
export function pluginBindingViolations(p: PipelineManifest, plugins: PluginSet): ValidationIssue[] {
  const v: ValidationIssue[] = [];
  const issue = (pointer: string, message: string) => v.push({ pointer, message });
  const byKey = indexPluginSet(plugins);
  const g = graphInfo(p);
  const fragmentAjv = createFragmentAjv();
  const nodesById = new Map<string, PipelineNode>(p.nodes.map((n) => [n.id, n]));
  const bindings = new Map<string, string[]>(); // pluginKey -> nodeIds

  p.nodes.forEach((n, i) => {
    const key = pluginKey(n.pluginId, n.pluginVersion);
    const manifest = byKey.get(key);
    if (!manifest) {
      issue(`/nodes/${i}/pluginId`, `unknown plugin '${key}' (not in the provided plugin-manifest set)`);
      return;
    }
    bindings.set(key, [...(bindings.get(key) ?? []), n.id]);
    if (manifest.category !== n.category) {
      issue(
        `/nodes/${i}/category`,
        `node category '${n.category}' does not match plugin '${key}' category '${manifest.category}'`
      );
    }
    // node.config (defaulting to {}) must validate against the plugin's paramsSchema;
    // unbound required params surface here.
    try {
      const validateParams = fragmentAjv.compile(manifest.paramsSchema as object);
      if (!validateParams(n.config ?? {})) {
        for (const err of validateParams.errors ?? []) {
          issue(
            `/nodes/${i}/config${err.instancePath}`,
            `config invalid against plugin '${key}' paramsSchema: ${err.message ?? 'violation'}`
          );
        }
      }
    } catch (e) {
      issue(`/nodes/${i}/config`, `plugin '${key}' paramsSchema failed to compile: ${(e as Error).message}`);
    }
    // Permitted failure policies (absent list means only 'abort').
    const declared = n.failurePolicy ?? 'abort';
    const permitted = manifest.permittedFailurePolicies ?? ['abort'];
    if (n.failurePolicy !== undefined && !permitted.includes(declared)) {
      issue(
        `/nodes/${i}/failurePolicy`,
        `failurePolicy '${declared}' is not permitted by plugin '${key}' (permitted: ${permitted.join(', ')})`
      );
    }
  });

  // multiInstance: repeated binding requires explicit multiInstance:true.
  for (const [key, nodeIds] of bindings) {
    const manifest = byKey.get(key)!;
    if (nodeIds.length > 1 && manifest.multiInstance !== true) {
      issue(
        '/nodes',
        `plugin '${key}' bound on ${nodeIds.length} nodes (${nodeIds.join(', ')}) but does not declare multiInstance:true`
      );
    }
  }

  // mayFeedScorer: every parent of the scorer must be admissible scorer input.
  const scorer = p.nodes.find((n) => n.category === 'scorer');
  if (scorer) {
    for (const parentId of g.parents.get(scorer.id) ?? []) {
      const parent = nodesById.get(parentId);
      if (!parent) continue;
      const manifest = byKey.get(pluginKey(parent.pluginId, parent.pluginVersion));
      if (manifest && manifest.mayFeedScorer !== true) {
        issue(
          '/edges',
          `node '${parentId}' feeds the scorer but plugin '${parent.pluginId}@${parent.pluginVersion}' declares mayFeedScorer:false`
        );
      }
    }
  }

  // Category-level ordering constraints (hints enforced at composition time):
  // mustRunAfter c: every declared node of category c must be an ancestor;
  // mustRunBefore c: every declared node of category c must be a descendant.
  const ancestors = (id: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [...(g.parents.get(id) ?? [])];
    while (stack.length) {
      const a = stack.pop()!;
      if (!seen.has(a)) {
        seen.add(a);
        stack.push(...(g.parents.get(a) ?? []));
      }
    }
    return seen;
  };
  const descendants = (id: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [...(g.out.get(id) ?? [])];
    while (stack.length) {
      const d = stack.pop()!;
      if (!seen.has(d)) {
        seen.add(d);
        stack.push(...(g.out.get(d) ?? []));
      }
    }
    return seen;
  };
  p.nodes.forEach((n, i) => {
    const manifest = byKey.get(pluginKey(n.pluginId, n.pluginVersion));
    const oc = manifest?.orderingConstraints;
    if (!oc) return;
    for (const cat of oc.mustRunAfter ?? []) {
      const anc = ancestors(n.id);
      for (const other of p.nodes.filter((m) => m.category === cat && m.id !== n.id)) {
        if (!anc.has(other.id)) {
          issue(
            `/nodes/${i}`,
            `plugin '${n.pluginId}@${n.pluginVersion}' mustRunAfter '${cat}' but node '${other.id}' (${cat}) is not an ancestor of '${n.id}'`
          );
        }
      }
    }
    for (const cat of oc.mustRunBefore ?? []) {
      const desc = descendants(n.id);
      for (const other of p.nodes.filter((m) => m.category === cat && m.id !== n.id)) {
        if (!desc.has(other.id)) {
          issue(
            `/nodes/${i}`,
            `plugin '${n.pluginId}@${n.pluginVersion}' mustRunBefore '${cat}' but node '${other.id}' (${cat}) is not a descendant of '${n.id}'`
          );
        }
      }
    }
  });

  return v;
}
