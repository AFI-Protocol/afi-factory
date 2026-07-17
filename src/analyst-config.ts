/**
 * afi.analyst-strategy-config.v1 semantic + cross-artifact checks — the
 * contract's x-afiConstraints the schema layer cannot express:
 *
 *  - strategyIdMajorAgreement: the _v<major> token embedded in strategyId
 *    must equal strategyVersion's major (OBJ-GOV D-OBJ-3);
 *  - pinnedTopology: pipelineRef must match the referenced manifest's
 *    identity and canonical manifestHash (fail closed on divergence);
 *  - scorerAgreement: scorerRef must equal the pipeline's single scorer
 *    node's binding;
 *  - boundedOverrides: nodeOverrides keys must name manifest nodes; override
 *    config is validated against the bound plugin's paramsSchema; a disabled
 *    node must keep the reduced graph admissible.
 */
import type { AnalystStrategyConfig } from './generated/analyst-strategy-config.js';
import type { PipelineManifest } from './generated/pipeline.js';
import { createFragmentAjv, type ValidationIssue } from './schemas.js';
import { graphInfo, indexPluginSet, type PluginSet } from './graph.js';
import { manifestHash } from './canonical-json.js';

/** Always-on semantic checks (no cross-artifact inputs needed). */
export function analystConfigViolations(config: AnalystStrategyConfig): ValidationIssue[] {
  const v: ValidationIssue[] = [];
  const m = /_v(0|[1-9]\d*)$/.exec(config.strategyId);
  if (m) {
    const embeddedMajor = m[1];
    const versionMajor = config.strategyVersion.split('.')[0];
    if (embeddedMajor !== versionMajor) {
      v.push({
        pointer: '/strategyId',
        message: `strategyId embeds major v${embeddedMajor} but strategyVersion '${config.strategyVersion}' has major ${versionMajor}`,
      });
    }
  }
  return v;
}

/**
 * Cross-artifact checks against the referenced pipeline manifest (and, when
 * provided, the plugin-manifest set for override config validation).
 */
export function analystConfigCrossViolations(
  config: AnalystStrategyConfig,
  pipeline: PipelineManifest,
  options: { plugins?: PluginSet } = {}
): ValidationIssue[] {
  const v: ValidationIssue[] = [];
  const issue = (pointer: string, message: string) => v.push({ pointer, message });

  if (config.pipelineRef.pipelineId !== pipeline.pipelineId)
    issue('/pipelineRef/pipelineId', `pipelineRef names '${config.pipelineRef.pipelineId}' but the manifest is '${pipeline.pipelineId}'`);
  if (config.pipelineRef.pipelineVersion !== pipeline.pipelineVersion)
    issue('/pipelineRef/pipelineVersion', `pipelineRef pins '${config.pipelineRef.pipelineVersion}' but the manifest is '${pipeline.pipelineVersion}'`);

  const computed = manifestHash(pipeline);
  if (config.pipelineRef.manifestHash.value !== computed.value)
    issue(
      '/pipelineRef/manifestHash/value',
      `manifestHash pin '${config.pipelineRef.manifestHash.value}' does not equal the manifest's canonical hash '${computed.value}' (fail closed)`
    );
  if (config.pipelineRef.manifestHash.canonicalizationVersion !== computed.canonicalizationVersion)
    issue(
      '/pipelineRef/manifestHash/canonicalizationVersion',
      `canonicalizationVersion '${config.pipelineRef.manifestHash.canonicalizationVersion}' differs from '${computed.canonicalizationVersion}' — hashes are never comparable across canonicalization versions`
    );

  const scorer = pipeline.nodes.find((n) => n.category === 'scorer');
  if (scorer) {
    if (config.scorerRef.pluginId !== scorer.pluginId || config.scorerRef.pluginVersion !== scorer.pluginVersion) {
      issue(
        '/scorerRef',
        `scorerRef '${config.scorerRef.pluginId}@${config.scorerRef.pluginVersion}' does not equal the pipeline's scorer binding '${scorer.pluginId}@${scorer.pluginVersion}'`
      );
    }
  }

  const nodesById = new Map(pipeline.nodes.map((n) => [n.id, n]));
  const byKey = options.plugins ? indexPluginSet(options.plugins) : undefined;
  const fragmentAjv = createFragmentAjv();
  for (const [nodeId, override] of Object.entries(config.nodeOverrides ?? {})) {
    const node = nodesById.get(nodeId);
    if (!node) {
      issue(`/nodeOverrides/${nodeId}`, `override references node '${nodeId}' not present in the pipeline manifest`);
      continue;
    }
    if (override.config && byKey) {
      const manifest = byKey.get(`${node.pluginId}@${node.pluginVersion}`);
      if (!manifest) {
        issue(`/nodeOverrides/${nodeId}/config`, `bound plugin '${node.pluginId}@${node.pluginVersion}' is not in the provided plugin-manifest set`);
      } else {
        try {
          const validateParams = fragmentAjv.compile(manifest.paramsSchema as object);
          if (!validateParams(override.config)) {
            for (const err of validateParams.errors ?? []) {
              issue(
                `/nodeOverrides/${nodeId}/config${err.instancePath}`,
                `override config invalid against plugin paramsSchema: ${err.message ?? 'violation'}`
              );
            }
          }
        } catch (e) {
          issue(`/nodeOverrides/${nodeId}/config`, `plugin paramsSchema failed to compile: ${(e as Error).message}`);
        }
      }
    }
    if (override.enabled === false) {
      if (node.category === 'scorer') {
        issue(`/nodeOverrides/${nodeId}/enabled`, 'the scorer node can never be disabled');
        continue;
      }
      if (pipeline.entry === nodeId) {
        issue(`/nodeOverrides/${nodeId}/enabled`, 'the entry node can never be disabled');
        continue;
      }
      // The reduced graph must stay admissible: every remaining node reachable
      // from entry and the scorer still the only reachable sink.
      const reduced: PipelineManifest = {
        ...pipeline,
        nodes: pipeline.nodes.filter((n) => n.id !== nodeId) as PipelineManifest['nodes'],
        edges: pipeline.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
      };
      const g = graphInfo(reduced);
      const unreachable = reduced.nodes.filter((n) => !g.reachable.has(n.id)).map((n) => n.id);
      if (unreachable.length) {
        issue(
          `/nodeOverrides/${nodeId}/enabled`,
          `disabling '${nodeId}' leaves node(s) ${unreachable.join(', ')} unreachable from entry`
        );
      }
      if (scorer) {
        const nonScorerSinks = [...g.reachable].filter(
          (id) => (g.out.get(id) ?? []).length === 0 && id !== scorer.id
        );
        if (nonScorerSinks.length) {
          issue(
            `/nodeOverrides/${nodeId}/enabled`,
            `disabling '${nodeId}' creates non-scorer sink(s) ${nonScorerSinks.join(', ')} (scorer bypass)`
          );
        }
      }
    }
  }

  return v;
}
