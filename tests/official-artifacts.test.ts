import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { validateDocument } from '../src/index.js';
import { instantiateTemplate } from '../src/template.js';
import { manifestHash, analystConfigHash, pluginSetHash } from '../src/canonical-json.js';
import type { PipelineManifest } from '../src/generated/pipeline.js';
import type { PipelineTemplate } from '../src/generated/pipeline-template.js';
import type { AnalystStrategyConfig } from '../src/generated/analyst-strategy-config.js';
import { officialDir, officialPlugins, readJson } from './helpers.js';

const template = readJson<PipelineTemplate>(join(officialDir, 'template.json'));
const manifest = readJson<PipelineManifest>(join(officialDir, 'pipeline.manifest.json'));
const analystConfig = readJson<AnalystStrategyConfig>(join(officialDir, 'analyst-config.json'));
const hashes = readJson<any>(join(officialDir, 'hashes.json'));
const plugins = officialPlugins();

describe('official froggy-trend-pullback artifacts', () => {
  it('ships exactly the seven official plugin manifests, each fully valid', () => {
    const files = readdirSync(join(officialDir, 'plugins')).sort();
    expect(files).toEqual([
      'afi-analysis-aiml.plugin.json',
      'afi-analysis-news.plugin.json',
      'afi-analysis-pattern.plugin.json',
      'afi-analysis-sentiment.plugin.json',
      'afi-analysis-technical.plugin.json',
      'afi-merge-enriched-view.plugin.json',
      'afi-scorer-froggy-trend-pullback.plugin.json',
    ]);
    for (const p of plugins) {
      const result = validateDocument('analysis-plugin', p);
      expect(result.errors, p.pluginId).toEqual([]);
    }
  });

  it('plugin declarations match the program design (determinism, capabilities, multiInstance, mayFeedScorer)', () => {
    const byId = new Map(plugins.map((p) => [p.pluginId, p]));
    expect(byId.get('afi-analysis-technical')).toMatchObject({
      category: 'technical',
      deterministic: true,
      capabilities: ['provider:price-feed'],
      multiInstance: true,
      mayFeedScorer: true,
    });
    expect(byId.get('afi-analysis-pattern')).toMatchObject({ category: 'pattern', deterministic: true, multiInstance: true });
    expect(byId.get('afi-analysis-sentiment')).toMatchObject({
      category: 'sentiment',
      deterministic: false,
      capabilities: ['provider:coinalyze', 'secret:COINALYZE_API_KEY'],
    });
    expect(byId.get('afi-analysis-news')).toMatchObject({
      category: 'news',
      deterministic: false,
      capabilities: ['provider:newsdata', 'secret:NEWSDATA_API_KEY'],
    });
    expect(byId.get('afi-analysis-aiml')).toMatchObject({
      category: 'aiMl',
      deterministic: false,
      capabilities: ['service:tiny-brains'],
    });
    expect(byId.get('afi-merge-enriched-view')).toMatchObject({ category: 'merge', deterministic: true, mayFeedScorer: true });
    expect(byId.get('afi-scorer-froggy-trend-pullback')).toMatchObject({
      category: 'scorer',
      multiInstance: false,
      mayFeedScorer: false,
    });
    for (const analysis of ['afi-analysis-technical', 'afi-analysis-pattern', 'afi-analysis-sentiment', 'afi-analysis-news', 'afi-analysis-aiml']) {
      expect(byId.get(analysis)!.multiInstance, `${analysis} multiInstance`).toBe(true);
    }
  });

  it('the committed manifest is fully admissible (schema + graph + plugin binding)', () => {
    const result = validateDocument('pipeline', manifest, { plugins });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('the manifest carries THE fixed 7-node design graph', () => {
    expect(manifest.pipelineId).toBe('froggy-trend-pullback');
    expect(manifest.pipelineVersion).toBe('v1.0.0');
    expect(manifest.entry).toBe('technical');
    expect(manifest.nodes.map((n) => [n.id, n.category, `${n.pluginId}@${n.pluginVersion}`])).toEqual([
      ['technical', 'technical', 'afi-analysis-technical@1.0.0'],
      ['pattern', 'pattern', 'afi-analysis-pattern@1.0.0'],
      ['sentiment', 'sentiment', 'afi-analysis-sentiment@1.0.0'],
      ['news', 'news', 'afi-analysis-news@1.0.0'],
      ['merge', 'merge', 'afi-merge-enriched-view@1.0.0'],
      ['aiml', 'aiMl', 'afi-analysis-aiml@1.0.0'],
      ['scorer', 'scorer', 'afi-scorer-froggy-trend-pullback@1.0.0'],
    ]);
    const byId = new Map(manifest.nodes.map((n) => [n.id, n]));
    expect((byId.get('technical') as any).config).toEqual({ candleLimit: 100 });
    expect((byId.get('news') as any).config).toEqual({ windowHours: 4 });
    for (const soft of ['technical', 'pattern', 'sentiment', 'news', 'aiml']) {
      expect(byId.get(soft)!.critical, `${soft} critical`).toBe(false);
      expect(byId.get(soft)!.failurePolicy, `${soft} failurePolicy`).toBe('degrade');
    }
    expect(byId.get('merge')!.join).toEqual({
      policy: 'all',
      merge: { strategy: 'namespace-by-node', conflictRule: 'error' },
    });
    // Edge set: candles port into pattern; four optional join edges; aiml augments the merged view.
    expect(manifest.edges).toEqual([
      { from: 'technical', to: 'pattern', fromPort: 'candles' },
      { from: 'technical', to: 'sentiment' },
      { from: 'technical', to: 'news' },
      { from: 'technical', to: 'merge', optional: true },
      { from: 'pattern', to: 'merge', optional: true },
      { from: 'sentiment', to: 'merge', optional: true },
      { from: 'news', to: 'merge', optional: true },
      { from: 'merge', to: 'aiml' },
      { from: 'aiml', to: 'scorer' },
    ]);
  });

  it('instantiating the official template with defaults reproduces the committed manifest EXACTLY', () => {
    const result = instantiateTemplate(template, {}, { plugins });
    expect(result.ok).toBe(true);
    expect(result.pipeline).toEqual(manifest);
  });

  it('the official analyst-config is valid, cross-checked against the manifest and plugin set', () => {
    const result = validateDocument('analyst-strategy-config', analystConfig, { pipeline: manifest, plugins });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(analystConfig).toMatchObject({
      analystId: 'froggy',
      strategyId: 'trend_pullback_v1',
      strategyVersion: '1.0.0',
      pipelineRef: { pipelineId: 'froggy-trend-pullback', pipelineVersion: 'v1.0.0' },
      scorerRef: { pluginId: 'afi-scorer-froggy-trend-pullback', pluginVersion: '1.0.0' },
      uwrProfileRef: { profileId: 'uwr-weighted-lifts-v0.1' },
      decayConfig: { ref: { templateId: 'decay-swing-v1' } },
    });
  });

  it('hashes.json is EXACTLY what the hasher computes today (downstream waves pin these)', () => {
    expect(hashes.afiConfigCommit).toBe('e462c4e8bef5fda946ca19a826f5c53c6d202151');
    expect(hashes.manifestHash).toEqual(manifestHash(manifest));
    expect(hashes.analystConfigHash).toEqual(analystConfigHash(analystConfig));
    expect(hashes.pluginSetHash).toEqual(pluginSetHash(plugins));
    // The analyst-config's own pin equals the manifest hash.
    expect(analystConfig.pipelineRef.manifestHash).toEqual(hashes.manifestHash);
    // Domain tags are the D-FCP-7 registered composition tags.
    expect(hashes.manifestHash.domainTag).toBe('afi.d2.composition-manifest');
    expect(hashes.analystConfigHash.domainTag).toBe('afi.d2.analyst-config');
    expect(hashes.pluginSetHash.domainTag).toBe('afi.d2.plugin-set');
  });

  it('hash values are stable across repeated computation (determinism)', () => {
    for (let i = 0; i < 3; i++) {
      expect(manifestHash(readJson(join(officialDir, 'pipeline.manifest.json'))).value).toBe(hashes.manifestHash.value);
    }
  });
});
