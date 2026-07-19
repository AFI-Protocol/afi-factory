import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { inspectPipeline, renderInspection } from '../src/inspect.js';
import type { PipelineManifest } from '../src/generated/pipeline.js';
import { officialDir, conformanceDir, readJson } from './helpers.js';

const manifest = readJson<PipelineManifest>(join(officialDir, 'pipeline.manifest.json'));

describe('resolved-graph inspection', () => {
  const inspection = inspectPipeline(manifest);

  it('derives the parallel waves (Kahn levels) of the froggy v1.3.0 graph', () => {
    expect(inspection.waves).toEqual([
      ['technical'],
      ['pattern', 'sentiment', 'news'],
      ['aiml'],
      ['merge'],
      ['scorer'],
    ]);
  });

  it('derives a deterministic execution order consistent with the waves', () => {
    expect(inspection.executionOrder).toEqual(['technical', 'pattern', 'sentiment', 'news', 'aiml', 'merge', 'scorer']);
  });

  it('tabulates every node with plugin binding, provider selection, and fail-fast policies', () => {
    expect(inspection.nodes).toHaveLength(7);
    const technical = inspection.nodes.find((n) => n.id === 'technical')!;
    // Category lanes are fail-fast under the governed default (EV3-GOV
    // D-EV3-5(1)) and select their provider via an explicit providerInstanceRef.
    expect(technical).toMatchObject({
      category: 'technical',
      plugin: 'afi-analysis-technical@2.0.0',
      critical: true,
      failurePolicy: 'abort',
      config: { candleLimit: 100 },
      providerInstanceRef: {
        providerInstanceId: 'afi-instance-reference-technical-local',
        recordVersion: '1.0.0',
      },
    });
    const aiml = inspection.nodes.find((n) => n.id === 'aiml')!;
    expect(aiml).toMatchObject({
      category: 'aiMl',
      plugin: 'afi-analysis-aiml@2.0.0',
      critical: true,
      failurePolicy: 'abort',
      providerInstanceRef: {
        providerInstanceId: 'afi-instance-reference-aiml-tiny-brains',
        recordVersion: '1.1.0',
      },
    });
    const scorer = inspection.nodes.find((n) => n.id === 'scorer')!;
    expect(scorer).toMatchObject({ critical: true, failurePolicy: 'abort' });
  });

  it('summarizes both deterministic joins with per-parent optionality', () => {
    expect(inspection.joins).toEqual([
      {
        nodeId: 'aiml',
        policy: 'all',
        strategy: 'namespace-by-node',
        conflictRule: 'error',
        parents: [
          { id: 'technical', optional: true, conditional: false },
          { id: 'pattern', optional: true, conditional: false },
          { id: 'sentiment', optional: true, conditional: false },
          { id: 'news', optional: true, conditional: false },
        ],
      },
      {
        nodeId: 'merge',
        policy: 'all',
        strategy: 'namespace-by-node',
        conflictRule: 'error',
        parents: [
          { id: 'technical', optional: true, conditional: false },
          { id: 'pattern', optional: true, conditional: false },
          { id: 'sentiment', optional: true, conditional: false },
          { id: 'news', optional: true, conditional: false },
          { id: 'aiml', optional: true, conditional: false },
        ],
      },
    ]);
  });

  it('renders a human-readable report carrying the same facts', () => {
    const text = renderInspection(inspection);
    expect(text).toContain('pipeline froggy-trend-pullback v1.3.0 (entry: technical)');
    expect(text).toContain('wave 1: pattern, sentiment, news');
    expect(text).toContain('afi-scorer-froggy-trend-pullback@1.0.0');
    expect(text).toContain('conflictRule=error');
  });

  it('summarizes conditional edges (operators + paths)', () => {
    const conditional = readJson<PipelineManifest>(join(conformanceDir, '05-conditional-node.json'));
    const result = inspectPipeline(conditional);
    expect(result.conditions).toEqual([
      {
        from: 'technical',
        to: 'news',
        operators: ['all', 'exists', 'gte'],
        paths: ['/nodes/technical/output/atrPct'],
      },
    ]);
  });
});
