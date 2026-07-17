import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { inspectPipeline, renderInspection } from '../src/inspect.js';
import type { PipelineManifest } from '../src/generated/pipeline.js';
import { officialDir, readJson } from './helpers.js';

const manifest = readJson<PipelineManifest>(join(officialDir, 'pipeline.manifest.json'));

describe('resolved-graph inspection', () => {
  const inspection = inspectPipeline(manifest);

  it('derives the parallel waves (Kahn levels) of the froggy graph', () => {
    expect(inspection.waves).toEqual([
      ['technical'],
      ['pattern', 'sentiment', 'news'],
      ['merge'],
      ['aiml'],
      ['scorer'],
    ]);
  });

  it('derives a deterministic execution order consistent with the waves', () => {
    expect(inspection.executionOrder).toEqual(['technical', 'pattern', 'sentiment', 'news', 'merge', 'aiml', 'scorer']);
  });

  it('tabulates every node with plugin binding and policies', () => {
    expect(inspection.nodes).toHaveLength(7);
    const technical = inspection.nodes.find((n) => n.id === 'technical')!;
    expect(technical).toMatchObject({
      category: 'technical',
      plugin: 'afi-analysis-technical@1.0.0',
      critical: false,
      failurePolicy: 'degrade',
      config: { candleLimit: 100 },
    });
    const scorer = inspection.nodes.find((n) => n.id === 'scorer')!;
    expect(scorer).toMatchObject({ critical: true, failurePolicy: 'abort' });
  });

  it('summarizes the join with per-parent optionality', () => {
    expect(inspection.joins).toEqual([
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
        ],
      },
    ]);
  });

  it('renders a human-readable report carrying the same facts', () => {
    const text = renderInspection(inspection);
    expect(text).toContain('pipeline froggy-trend-pullback v1.0.0 (entry: technical)');
    expect(text).toContain('wave 1: pattern, sentiment, news');
    expect(text).toContain('afi-scorer-froggy-trend-pullback@1.0.0');
    expect(text).toContain('conflictRule=error');
  });

  it('summarizes conditional edges (operators + paths)', () => {
    const conditional = readJson<PipelineManifest>(
      join(officialDir, '..', '..', '..', 'fixtures', 'conformance', '05-conditional-node.json')
    );
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
