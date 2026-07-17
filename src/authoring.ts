/**
 * Shared authoring helpers used by BOTH the afi-factory CLI and the agent
 * operation handlers — the single source for skeleton construction and template
 * slot rendering, so the two surfaces cannot drift. Every emitted skeleton is
 * validated by its caller against the governed schema closure before use.
 */
import { manifestHash } from './canonical-json.js';
import type { PipelineManifest } from './generated/pipeline.js';
import type { AnalystStrategyConfig } from './generated/analyst-strategy-config.js';

/** Minimal valid afi.pipeline-template.v1 skeleton: single technical stage -> scorer. */
export function skeletonTemplate(templateId: string, pipelineId: string): Record<string, unknown> {
  return {
    schema: 'afi.pipeline-template.v1',
    templateId,
    templateVersion: 'v0.1.0',
    description:
      'SKELETON template: single technical stage into the scorer. Edit the graph, parameters, and plugin bindings.',
    parameters: [
      {
        name: 'technicalTimeoutMs',
        schema: { type: 'integer', minimum: 1 },
        required: false,
        default: 5000,
        description: 'Timeout for the technical stage.',
      },
    ],
    pipelineId,
    pipelineVersion: 'v0.1.0',
    entry: 'technical',
    nodes: [
      {
        id: 'technical',
        category: 'technical',
        pluginId: 'my-technical',
        pluginVersion: '0.1.0',
        timeoutMs: { $param: 'technicalTimeoutMs' },
      },
      {
        id: 'scorer',
        category: 'scorer',
        pluginId: 'my-scorer',
        pluginVersion: '0.1.0',
      },
    ],
    edges: [{ from: 'technical', to: 'scorer' }],
  };
}

export interface AnalystConfigSkeletonOptions {
  analystId?: string;
  strategyId?: string;
  strategyVersion?: string;
  uwrProfileId?: string;
  decayTemplateId?: string;
}

/**
 * Builds an afi.analyst-strategy-config.v1 skeleton pinned (by canonical hash)
 * to the given manifest. The manifest MUST be a graph-valid pipeline with a
 * scorer node (callers validate first).
 */
export function skeletonAnalystConfig(
  manifest: PipelineManifest,
  opts: AnalystConfigSkeletonOptions = {}
): AnalystStrategyConfig {
  const scorer = manifest.nodes.find((n) => n.category === 'scorer');
  if (!scorer) {
    throw new Error('cannot build analyst-config skeleton: pipeline has no scorer node');
  }
  return {
    schema: 'afi.analyst-strategy-config.v1',
    analystId: opts.analystId ?? 'my-analyst',
    strategyId: opts.strategyId ?? 'my_strategy_v0',
    strategyVersion: opts.strategyVersion ?? '0.1.0',
    pipelineRef: {
      pipelineId: manifest.pipelineId,
      pipelineVersion: manifest.pipelineVersion,
      manifestHash: manifestHash(manifest),
    },
    scorerRef: { pluginId: scorer.pluginId, pluginVersion: scorer.pluginVersion },
    uwrProfileRef: { profileId: opts.uwrProfileId ?? 'uwr-weighted-lifts-v0.1' },
    decayConfig: { ref: { templateId: opts.decayTemplateId ?? 'decay-swing-v1' } },
  } as AnalystStrategyConfig;
}

/** Renders {"$param":"<name>"} slots as the string `$param:<name>` for inspection. */
export function slotsToStrings(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(slotsToStrings);
  if (x && typeof x === 'object') {
    const keys = Object.keys(x);
    if (keys.length === 1 && keys[0] === '$param') return `$param:${(x as { $param: string }).$param}`;
    const out: Record<string, unknown> = {};
    keys.forEach((k) => (out[k] = slotsToStrings((x as Record<string, unknown>)[k])));
    return out;
  }
  return x;
}
