/**
 * Resolved-graph inspection: execution order + parallel waves (Kahn levels),
 * node table (plugin binding, category, policies), join/condition summary.
 * Produces a machine-readable object and a human-readable rendering.
 */
import type { PipelineManifest } from './generated/pipeline.js';
import { graphInfo } from './graph.js';

export interface NodeRow {
  id: string;
  category: string;
  plugin: string;
  critical: boolean;
  failurePolicy: 'abort' | 'degrade';
  timeoutMs?: number;
  maxRetries?: number;
  retryDelayMs?: number;
  backoff?: string;
  config?: unknown;
  /** Non-secret provider-instance reference (identity + version only; PBF-GOV D-PBF-4). */
  providerInstanceRef?: { providerInstanceId: string; recordVersion: string };
}

export interface JoinSummary {
  nodeId: string;
  policy: string;
  strategy: string;
  conflictRule: string;
  parents: Array<{ id: string; optional: boolean; conditional: boolean }>;
}

export interface ConditionSummary {
  from: string;
  to: string;
  operators: string[];
  paths: string[];
}

export interface PipelineInspection {
  pipelineId: string;
  pipelineVersion: string;
  entry: string;
  executionOrder: string[];
  /** Kahn levels: nodes within one wave may execute concurrently. */
  waves: string[][];
  nodes: NodeRow[];
  joins: JoinSummary[];
  conditions: ConditionSummary[];
}

function conditionOperators(condition: unknown, ops: string[] = []): string[] {
  if (Array.isArray(condition)) {
    condition.forEach((c) => conditionOperators(c, ops));
    return ops;
  }
  if (condition && typeof condition === 'object') {
    for (const [k, v] of Object.entries(condition)) {
      if (['all', 'any', 'not', 'exists', 'eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in'].includes(k)) {
        ops.push(k);
        conditionOperators(v, ops);
      }
    }
  }
  return ops;
}

function conditionPaths(condition: unknown, paths: string[] = []): string[] {
  if (Array.isArray(condition)) {
    condition.forEach((c) => conditionPaths(c, paths));
    return paths;
  }
  if (condition && typeof condition === 'object') {
    for (const [k, v] of Object.entries(condition)) {
      if ((k === 'exists' || k === 'path') && typeof v === 'string') paths.push(v);
      else conditionPaths(v, paths);
    }
  }
  return paths;
}

/** Inspects a (graph-clean) afi.pipeline.v1 manifest. */
export function inspectPipeline(p: PipelineManifest): PipelineInspection {
  const g = graphInfo(p);
  const edgesTo = (id: string) => p.edges.filter((e) => e.to === id);
  return {
    pipelineId: p.pipelineId,
    pipelineVersion: p.pipelineVersion,
    entry: p.entry,
    executionOrder: g.order,
    waves: g.waves,
    nodes: p.nodes.map((n) => ({
      id: n.id,
      category: n.category,
      plugin: `${n.pluginId}@${n.pluginVersion}`,
      critical: n.critical ?? true,
      failurePolicy: n.failurePolicy ?? 'abort',
      ...(n.timeoutMs !== undefined ? { timeoutMs: n.timeoutMs } : {}),
      ...(n.maxRetries !== undefined ? { maxRetries: n.maxRetries } : {}),
      ...(n.retryDelayMs !== undefined ? { retryDelayMs: n.retryDelayMs } : {}),
      ...(n.backoff !== undefined ? { backoff: n.backoff } : {}),
      ...(n.config !== undefined ? { config: n.config } : {}),
      ...(n.providerInstanceRef !== undefined ? { providerInstanceRef: n.providerInstanceRef } : {}),
    })),
    joins: p.nodes
      .filter((n) => n.join)
      .map((n) => ({
        nodeId: n.id,
        policy: n.join!.policy,
        strategy: n.join!.merge.strategy,
        conflictRule: n.join!.merge.conflictRule,
        parents: edgesTo(n.id).map((e) => ({
          id: e.from,
          optional: e.optional ?? false,
          conditional: e.condition !== undefined,
        })),
      })),
    conditions: p.edges
      .filter((e) => e.condition)
      .map((e) => ({
        from: e.from,
        to: e.to,
        operators: [...new Set(conditionOperators(e.condition))],
        paths: [...new Set(conditionPaths(e.condition))],
      })),
  };
}

/** Human-readable rendering of an inspection. */
export function renderInspection(i: PipelineInspection): string {
  const lines: string[] = [];
  lines.push(`pipeline ${i.pipelineId} ${i.pipelineVersion} (entry: ${i.entry})`);
  lines.push('');
  lines.push('execution order:');
  lines.push(`  ${i.executionOrder.join(' -> ')}`);
  lines.push('');
  lines.push('parallel waves (Kahn levels):');
  i.waves.forEach((wave, idx) => lines.push(`  wave ${idx}: ${wave.join(', ')}`));
  lines.push('');
  lines.push('nodes:');
  for (const n of i.nodes) {
    const policy = n.critical ? 'critical/abort' : `non-critical/${n.failurePolicy}`;
    const extras = [
      n.timeoutMs !== undefined ? `timeoutMs=${n.timeoutMs}` : '',
      n.maxRetries !== undefined ? `maxRetries=${n.maxRetries}` : '',
      n.backoff !== undefined ? `backoff=${n.backoff}` : '',
      n.config !== undefined ? `config=${JSON.stringify(n.config)}` : '',
    ]
      .filter(Boolean)
      .join(' ');
    lines.push(`  ${n.id}  [${n.category}]  ${n.plugin}  ${policy}${extras ? '  ' + extras : ''}`);
  }
  if (i.joins.length) {
    lines.push('');
    lines.push('joins:');
    for (const j of i.joins) {
      const parents = j.parents
        .map((pp) => `${pp.id}${pp.optional ? ' (optional)' : ''}${pp.conditional ? ' (conditional)' : ''}`)
        .join(', ');
      lines.push(`  ${j.nodeId}: policy=${j.policy} strategy=${j.strategy} conflictRule=${j.conflictRule}`);
      lines.push(`    parents: ${parents}`);
    }
  }
  if (i.conditions.length) {
    lines.push('');
    lines.push('conditional edges:');
    for (const c of i.conditions) {
      lines.push(`  ${c.from} -> ${c.to}  operators: ${c.operators.join(', ')}  paths: ${c.paths.join(', ')}`);
    }
  }
  return lines.join('\n');
}
