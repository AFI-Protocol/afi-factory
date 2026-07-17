import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateDocument } from '../src/index.js';
import type { PipelineManifest } from '../src/generated/pipeline.js';
import { conformanceDir, officialPlugins, readJson } from './helpers.js';

/**
 * The eight configurability proof graphs (D-FCP-2 acceptance shapes) as valid
 * manifest documents — clearly non-production fixtures, each fully admissible
 * against the governed contracts + the official plugin set.
 */

const plugins = officialPlugins();

const EXPECTED_FILES = [
  '01-one-category.json',
  '02-sequential-multi-category.json',
  '03-parallel-multi-category.json',
  '04-branch-deterministic-join.json',
  '05-conditional-node.json',
  '06-repeated-same-category.json',
  '07-fail-soft-optional-category.json',
  '08-critical-category-failure.json',
];

describe('conformance fixtures (8 proof graphs)', () => {
  it('the fixture set is exactly the eight authorized proof graphs (drift guard)', () => {
    expect(readdirSync(conformanceDir).filter((f) => f.endsWith('.json')).sort()).toEqual(EXPECTED_FILES);
  });

  for (const file of EXPECTED_FILES) {
    it(`${file} is fully admissible (schema + graph + plugin binding) and marked non-production`, () => {
      const doc = readJson<PipelineManifest>(join(conformanceDir, file));
      const result = validateDocument('pipeline', doc, { plugins });
      expect(result.errors).toEqual([]);
      expect(result.ok).toBe(true);
      expect(doc.description).toContain('CONFORMANCE FIXTURE');
      expect(doc.description).toContain('non-production');
    });
  }

  it('01: one category feeding the scorer directly', () => {
    const doc = readJson<PipelineManifest>(join(conformanceDir, '01-one-category.json'));
    expect(doc.nodes.map((n) => n.category)).toEqual(['technical', 'scorer']);
  });

  it('02: strict sequential multi-category chain', () => {
    const doc = readJson<PipelineManifest>(join(conformanceDir, '02-sequential-multi-category.json'));
    expect(doc.edges).toEqual([
      { from: 'technical', to: 'pattern', fromPort: 'candles' },
      { from: 'pattern', to: 'scorer' },
    ]);
  });

  it('03: concurrency derived from dependency structure (two parallel branches)', () => {
    const doc = readJson<PipelineManifest>(join(conformanceDir, '03-parallel-multi-category.json'));
    const parents = (id: string) => doc.edges.filter((e) => e.to === id).map((e) => e.from);
    expect(parents('sentiment')).toEqual(['technical']);
    expect(parents('news')).toEqual(['technical']);
    expect(parents('merge').sort()).toEqual(['news', 'sentiment', 'technical']);
  });

  it('04: multi-parent join is deterministic by construction', () => {
    const doc = readJson<PipelineManifest>(join(conformanceDir, '04-branch-deterministic-join.json'));
    const merge = doc.nodes.find((n) => n.id === 'merge')!;
    expect(merge.join).toEqual({ policy: 'all', merge: { strategy: 'namespace-by-node', conflictRule: 'error' } });
  });

  it('05: condition-gated node (predicate tree, data not code) joined as optional', () => {
    const doc = readJson<PipelineManifest>(join(conformanceDir, '05-conditional-node.json'));
    const gated = doc.edges.find((e) => e.to === 'news')!;
    expect(gated.condition).toBeDefined();
    expect(JSON.stringify(gated.condition)).not.toMatch(/function|eval|=>/);
    const joinEdge = doc.edges.find((e) => e.from === 'news' && e.to === 'merge')!;
    expect(joinEdge.optional).toBe(true);
  });

  it('06: repeated same-category nodes with different params (multiInstance plugin)', () => {
    const doc = readJson<PipelineManifest>(join(conformanceDir, '06-repeated-same-category.json'));
    const news = doc.nodes.filter((n) => n.category === 'news');
    expect(news).toHaveLength(2);
    expect(news.map((n) => n.pluginId)).toEqual(['afi-analysis-news', 'afi-analysis-news']);
    expect((news[0] as any).config.windowHours).not.toBe((news[1] as any).config.windowHours);
  });

  it('07: fail-soft optional category (critical:false + degrade + optional join edge)', () => {
    const doc = readJson<PipelineManifest>(join(conformanceDir, '07-fail-soft-optional-category.json'));
    const sentiment = doc.nodes.find((n) => n.id === 'sentiment')!;
    expect(sentiment.critical).toBe(false);
    expect(sentiment.failurePolicy).toBe('degrade');
    expect(doc.edges.find((e) => e.from === 'sentiment' && e.to === 'merge')!.optional).toBe(true);
  });

  it('08: critical category failure (explicit critical:true + abort)', () => {
    const doc = readJson<PipelineManifest>(join(conformanceDir, '08-critical-category-failure.json'));
    const pattern = doc.nodes.find((n) => n.id === 'pattern')!;
    expect(pattern.critical).toBe(true);
    expect(pattern.failurePolicy).toBe('abort');
  });
});
