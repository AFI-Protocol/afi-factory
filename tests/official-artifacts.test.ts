import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateDocument } from '../src/index.js';
import { manifestHash, analystConfigHash, pluginSetHash } from '../src/canonical-json.js';
import type { PipelineManifest } from '../src/generated/pipeline.js';
import type { AnalystStrategyConfig } from '../src/generated/analyst-strategy-config.js';
import { officialDir, officialPlugins, readJson } from './helpers.js';

/**
 * The official froggy-trend-pullback composition artifacts are BYTE-IDENTICAL
 * copies of the canonical afi-config registry records at the pinned commit
 * (hashes.json afiConfigCommit — the same pin as src/governed-schema/
 * MANIFEST.json): the registered pipeline manifest v1.3.0 (EV3-GOV
 * D-EV3-5(1), all-five fail-fast provider-backed category lanes), the
 * canonical analyst-strategy config, and the seven bound plugin records.
 * Factory authors and validates against these records; it never redefines
 * them. The committed hash pins equal the pins carried by the canonical
 * registration and the runtime composition provenance.
 */

// The canonical composition pins (registries at the pinned afi-config commit
// below; identical to
// the values recorded by the canonical analyst-strategy registration and the
// runtime's composition provenance).
const PINNED_AFI_CONFIG_COMMIT = '22e79cff1c4b312db792ef71b10d1610fcdbc65c';
const CANONICAL_MANIFEST_HASH = 'df3372dadaca1595d0e6d2f6bad9464ccc9abb7106e9f5b7111df148a145bc4f';
const CANONICAL_ANALYST_CONFIG_HASH = 'e34471dec8dd3b8fcf0e5576765e469aec1a89f77af6b693ef3c06fc4200bbad';
const CANONICAL_PLUGIN_SET_HASH = '5384e1c08ce4bd7f533acc15487df81d7d37b6615d109d611bde968a81f2f386';

const PLUGIN_FILES = [
  'afi-analysis-aiml--2.0.0.json',
  'afi-analysis-news--2.0.0.json',
  'afi-analysis-pattern--2.0.0.json',
  'afi-analysis-sentiment--2.0.0.json',
  'afi-analysis-technical--2.0.0.json',
  'afi-merge-enriched-view--1.1.0.json',
  'afi-scorer-froggy-trend-pullback--1.0.0.json',
];

const manifest = readJson<PipelineManifest>(join(officialDir, 'pipeline.manifest.json'));
const analystConfig = readJson<AnalystStrategyConfig>(join(officialDir, 'analyst-config.json'));
const hashes = readJson<any>(join(officialDir, 'hashes.json'));
const plugins = officialPlugins();

describe('official froggy-trend-pullback artifacts', () => {
  it('ships exactly the seven canonical plugin records, each fully valid', () => {
    const files = readdirSync(join(officialDir, 'plugins')).sort();
    expect(files).toEqual(PLUGIN_FILES);
    for (const p of plugins) {
      const result = validateDocument('analysis-plugin', p);
      expect(result.errors, p.pluginId).toEqual([]);
    }
  });

  it('plugin declarations match the current five-lane provider runtime', () => {
    const byId = new Map(plugins.map((p) => [p.pluginId, p]));
    // The five provider-instance-backed category lane plugins (2.0.0).
    for (const lane of ['technical', 'pattern', 'sentiment', 'news', 'aiMl'] as const) {
      const plugin = plugins.find((p) => p.category === lane)!;
      expect(plugin.pluginVersion, `${plugin.pluginId} version`).toBe('2.0.0');
      expect(plugin.capabilities, `${plugin.pluginId} capabilities`).toEqual(['provider:instance-backed']);
      expect(plugin.multiInstance, `${plugin.pluginId} multiInstance`).toBe(true);
      expect(plugin.mayFeedScorer, `${plugin.pluginId} mayFeedScorer`).toBe(true);
    }
    expect(byId.get('afi-merge-enriched-view')).toMatchObject({
      category: 'merge',
      pluginVersion: '1.1.0',
      deterministic: true,
      mayFeedScorer: true,
    });
    expect(byId.get('afi-scorer-froggy-trend-pullback')).toMatchObject({
      category: 'scorer',
      pluginVersion: '1.0.0',
      multiInstance: false,
      mayFeedScorer: false,
    });
  });

  it('the committed manifest is fully admissible (schema + graph + plugin binding)', () => {
    const result = validateDocument('pipeline', manifest, { plugins });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('the manifest carries THE current v1.3.0 five-lane provider-backed graph', () => {
    expect(manifest.pipelineId).toBe('froggy-trend-pullback');
    expect(manifest.pipelineVersion).toBe('v1.3.0');
    expect(manifest.entry).toBe('technical');
    expect(manifest.nodes.map((n) => [n.id, n.category, `${n.pluginId}@${n.pluginVersion}`])).toEqual([
      ['technical', 'technical', 'afi-analysis-technical@2.0.0'],
      ['pattern', 'pattern', 'afi-analysis-pattern@2.0.0'],
      ['sentiment', 'sentiment', 'afi-analysis-sentiment@2.0.0'],
      ['news', 'news', 'afi-analysis-news@2.0.0'],
      ['aiml', 'aiMl', 'afi-analysis-aiml@2.0.0'],
      ['merge', 'merge', 'afi-merge-enriched-view@1.1.0'],
      ['scorer', 'scorer', 'afi-scorer-froggy-trend-pullback@1.0.0'],
    ]);
    const byId = new Map(manifest.nodes.map((n) => [n.id, n]));
    // Every category lane selects its provider through an explicit
    // providerInstanceRef — the all-five keyless/self-hosted reference profile.
    expect((byId.get('technical') as any).providerInstanceRef).toEqual({
      providerInstanceId: 'afi-instance-reference-technical-local',
      recordVersion: '1.0.0',
    });
    expect((byId.get('pattern') as any).providerInstanceRef).toEqual({
      providerInstanceId: 'afi-instance-reference-pattern-candlestick',
      recordVersion: '1.0.0',
    });
    expect((byId.get('sentiment') as any).providerInstanceRef).toEqual({
      providerInstanceId: 'afi-instance-reference-sentiment-cftc-cot',
      recordVersion: '1.0.0',
    });
    expect((byId.get('news') as any).providerInstanceRef).toEqual({
      providerInstanceId: 'afi-instance-reference-news-sec-edgar',
      recordVersion: '1.0.0',
    });
    expect((byId.get('aiml') as any).providerInstanceRef).toEqual({
      providerInstanceId: 'afi-instance-reference-aiml-tiny-brains',
      recordVersion: '1.1.0',
    });
    // All five lanes are fail-fast under the governed default (EV3-GOV
    // D-EV3-5(1) retired the degrade allowance): no critical/failurePolicy.
    for (const lane of ['technical', 'pattern', 'sentiment', 'news', 'aiml']) {
      expect(byId.get(lane)!.critical, `${lane} critical`).toBeUndefined();
      expect(byId.get(lane)!.failurePolicy, `${lane} failurePolicy`).toBeUndefined();
    }
    expect((byId.get('technical') as any).config).toEqual({ candleLimit: 100 });
    // Deterministic joins: the aiMl lane joins its four sibling lane outputs;
    // the merge node joins all five lanes.
    const join_ = { policy: 'all', merge: { strategy: 'namespace-by-node', conflictRule: 'error' } };
    expect(byId.get('aiml')!.join).toEqual(join_);
    expect(byId.get('merge')!.join).toEqual(join_);
    expect(manifest.edges).toEqual([
      { from: 'technical', to: 'pattern', fromPort: 'candles' },
      { from: 'technical', to: 'sentiment' },
      { from: 'technical', to: 'news' },
      { from: 'technical', to: 'aiml', optional: true },
      { from: 'pattern', to: 'aiml', optional: true },
      { from: 'sentiment', to: 'aiml', optional: true },
      { from: 'news', to: 'aiml', optional: true },
      { from: 'technical', to: 'merge', optional: true },
      { from: 'pattern', to: 'merge', optional: true },
      { from: 'sentiment', to: 'merge', optional: true },
      { from: 'news', to: 'merge', optional: true },
      { from: 'aiml', to: 'merge', optional: true },
      { from: 'merge', to: 'scorer' },
    ]);
  });

  it('the official analyst-config is valid, cross-checked against the manifest and plugin set', () => {
    const result = validateDocument('analyst-strategy-config', analystConfig, { pipeline: manifest, plugins });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(analystConfig).toMatchObject({
      analystId: 'froggy',
      strategyId: 'trend_pullback_v1',
      strategyVersion: '1.0.0',
      pipelineRef: { pipelineId: 'froggy-trend-pullback', pipelineVersion: 'v1.3.0' },
      scorerRef: { pluginId: 'afi-scorer-froggy-trend-pullback', pluginVersion: '1.0.0' },
      uwrProfileRef: { profileId: 'uwr-weighted-lifts-v0.1' },
      decayConfig: { ref: { templateId: 'decay-swing-v1' } },
    });
  });

  it('hashes.json is EXACTLY what the hasher computes today AND equals the canonical composition pins', () => {
    expect(hashes.afiConfigCommit).toBe(PINNED_AFI_CONFIG_COMMIT);
    expect(hashes.manifestHash).toEqual(manifestHash(manifest));
    expect(hashes.analystConfigHash).toEqual(analystConfigHash(analystConfig));
    expect(hashes.pluginSetHash).toEqual(pluginSetHash(plugins));
    // The committed values equal the canonical pins carried by the registered
    // analyst-strategy config/registration and the runtime composition
    // provenance — Factory reproduces them, it never redefines them.
    expect(hashes.manifestHash.value).toBe(CANONICAL_MANIFEST_HASH);
    expect(hashes.analystConfigHash.value).toBe(CANONICAL_ANALYST_CONFIG_HASH);
    expect(hashes.pluginSetHash.value).toBe(CANONICAL_PLUGIN_SET_HASH);
    // The analyst-config's own pin equals the manifest hash.
    expect(analystConfig.pipelineRef.manifestHash).toEqual(hashes.manifestHash);
    // Domain tags are the D-FCP-7 registered composition tags.
    expect(hashes.manifestHash.domainTag).toBe('afi.d2.composition-manifest');
    expect(hashes.analystConfigHash.domainTag).toBe('afi.d2.analyst-config');
    expect(hashes.pluginSetHash.domainTag).toBe('afi.d2.plugin-set');
    // The same afi-config commit pins the governed schema closure — one pin,
    // never two.
    const closure = readJson<any>(join(officialDir, '..', '..', 'src', 'governed-schema', 'MANIFEST.json'));
    expect(closure.afiConfigCommit).toBe(PINNED_AFI_CONFIG_COMMIT);
  });

  it('hash values are stable across repeated computation (determinism)', () => {
    for (let i = 0; i < 3; i++) {
      expect(manifestHash(readJson(join(officialDir, 'pipeline.manifest.json'))).value).toBe(hashes.manifestHash.value);
    }
  });

  it('every artifact is BYTE-IDENTICAL to its canonical afi-config registry record (when AFI_CONFIG_DIR is provided; CI always provides it)', () => {
    const configDir = process.env.AFI_CONFIG_DIR;
    if (!configDir) return; // sha-pinned hash assertions above still ran
    const sources: Array<[string, string]> = [
      ['pipeline.manifest.json', 'registries/pipelines/froggy-trend-pullback--v1.3.0.json'],
      ['analyst-config.json', 'registries/analyst-strategies/froggy--trend_pullback_v1--1.0.0.config.json'],
      ...PLUGIN_FILES.map((f): [string, string] => [join('plugins', f), `registries/analysis-plugins/${f}`]),
    ];
    for (const [local, canonical] of sources) {
      const canonicalPath = join(configDir, canonical);
      expect(existsSync(canonicalPath), `${canonical} missing from AFI_CONFIG_DIR`).toBe(true);
      expect(
        readFileSync(join(officialDir, local), 'utf-8'),
        `${local} must be byte-identical to afi-config ${canonical}`
      ).toBe(readFileSync(canonicalPath, 'utf-8'));
    }
  });
});
