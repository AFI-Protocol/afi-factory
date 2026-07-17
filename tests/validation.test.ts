import { describe, it, expect } from 'vitest';
import { validateAgainstSchema, validateDocument } from '../src/index.js';
import { pipelineGraphViolations, pluginBindingViolations } from '../src/graph.js';
import { analystConfigViolations, analystConfigCrossViolations } from '../src/analyst-config.js';
import { semanticViolations } from '../src/loader.js';
import { manifestHash } from '../src/canonical-json.js';
import type { PipelineManifest } from '../src/generated/pipeline.js';
import type { AnalystStrategyConfig } from '../src/generated/analyst-strategy-config.js';
import { officialPlugins, clone } from './helpers.js';

/**
 * Semantic-layer mirror of the afi-config test-suite graph semantics
 * (afi-config tests/pipeline-schema-validation.test.ts) plus the factory's
 * plugin-binding layer. Admissible = schema-valid AND graph-clean.
 */

const plugins = officialPlugins();

function base(): PipelineManifest {
  return clone({
    schema: 'afi.pipeline.v1',
    pipelineId: 'semantic-base',
    pipelineVersion: 'v1.0.0',
    entry: 'technical',
    nodes: [
      { id: 'technical', category: 'technical', pluginId: 'afi-analysis-technical', pluginVersion: '1.0.0' },
      { id: 'pattern', category: 'pattern', pluginId: 'afi-analysis-pattern', pluginVersion: '1.0.0' },
      { id: 'sentiment', category: 'sentiment', pluginId: 'afi-analysis-sentiment', pluginVersion: '1.0.0' },
      {
        id: 'merge',
        category: 'merge',
        pluginId: 'afi-merge-enriched-view',
        pluginVersion: '1.0.0',
        join: { policy: 'all', merge: { strategy: 'namespace-by-node', conflictRule: 'error' } },
      },
      { id: 'scorer', category: 'scorer', pluginId: 'afi-scorer-froggy-trend-pullback', pluginVersion: '1.0.0' },
    ],
    edges: [
      { from: 'technical', to: 'pattern' },
      { from: 'technical', to: 'sentiment' },
      { from: 'pattern', to: 'merge' },
      { from: 'sentiment', to: 'merge' },
      { from: 'merge', to: 'scorer' },
    ],
  } as PipelineManifest);
}

function messages(issues: { message: string }[]): string {
  return issues.map((i) => i.message).join('; ');
}

describe('pipeline graph semantics (afi-config mirror)', () => {
  it('the base manifest is fully admissible (schema + graph + binding)', () => {
    const result = validateDocument('pipeline', base(), { plugins });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('duplicate node ids are rejected', () => {
    const p = base();
    p.nodes[1] = { ...p.nodes[1], id: 'technical' };
    p.edges = [
      { from: 'technical', to: 'sentiment' },
      { from: 'sentiment', to: 'scorer' },
    ] as any;
    expect(messages(pipelineGraphViolations(p))).toContain('duplicate node id');
  });

  it('unknown edge endpoints and self-edges are rejected', () => {
    const p = base();
    p.edges.push({ from: 'ghost', to: 'technical' } as any);
    p.edges.push({ from: 'technical', to: 'technical' } as any);
    const msgs = messages(pipelineGraphViolations(p));
    expect(msgs).toContain("edge.from names unknown node 'ghost'");
    expect(msgs).toContain("self-edge on 'technical'");
  });

  it('an unknown entry is rejected', () => {
    const p = base();
    (p as any).entry = 'ghost';
    expect(messages(pipelineGraphViolations(p))).toContain("entry names unknown node 'ghost'");
  });

  it('cycles are rejected (Kahn)', () => {
    const p = base();
    p.edges.push({ from: 'merge', to: 'technical' } as any);
    // merge now has 3 parents (join still declared) and the graph cycles.
    expect(messages(pipelineGraphViolations(p))).toContain('cycle detected');
  });

  it('zero scorers is inadmissible at BOTH layers (schema contains + graph)', () => {
    const p = base();
    p.nodes = p.nodes.filter((n) => n.category !== 'scorer') as any;
    p.edges = p.edges.filter((e) => e.to !== 'scorer') as any;
    expect(validateAgainstSchema('pipeline', p).ok).toBe(false);
    expect(messages(pipelineGraphViolations(p))).toContain('zero scorer nodes');
  });

  it('multiple scorers are rejected', () => {
    const p = base();
    p.nodes.push({ id: 'scorer2', category: 'scorer', pluginId: 'afi-scorer-froggy-trend-pullback', pluginVersion: '1.0.0' } as any);
    p.edges.push({ from: 'merge', to: 'scorer2' } as any);
    const msgs = messages(pipelineGraphViolations(p));
    expect(msgs).toContain('multiple scorer nodes');
  });

  it('a non-scorer sink reachable from entry is a scorer bypass', () => {
    const p = base();
    p.nodes.push({ id: 'dangling', category: 'news', pluginId: 'afi-analysis-news', pluginVersion: '1.0.0' } as any);
    p.edges.push({ from: 'technical', to: 'dangling' } as any);
    expect(messages(pipelineGraphViolations(p))).toContain("non-scorer sink 'dangling'");
  });

  it('nodes unreachable from entry are rejected', () => {
    const p = base();
    p.nodes.push({ id: 'island', category: 'news', pluginId: 'afi-analysis-news', pluginVersion: '1.0.0' } as any);
    p.edges.push({ from: 'island', to: 'merge' } as any);
    expect(messages(pipelineGraphViolations(p))).toContain("node 'island' unreachable from entry");
  });

  it('a scorer with outgoing edges is not a sink', () => {
    const p = base();
    p.nodes.push({ id: 'post', category: 'news', pluginId: 'afi-analysis-news', pluginVersion: '1.0.0' } as any);
    p.edges.push({ from: 'scorer', to: 'post' } as any);
    expect(messages(pipelineGraphViolations(p))).toContain('scorer is not a sink');
  });

  it('join declared iff in-degree > 1 (both directions)', () => {
    const missingJoin = base();
    delete (missingJoin.nodes[3] as any).join;
    expect(messages(pipelineGraphViolations(missingJoin))).toContain("node 'merge' has 2 parents but declares no join");

    const extraJoin = base();
    (extraJoin.nodes[1] as any).join = {
      policy: 'all',
      merge: { strategy: 'namespace-by-node', conflictRule: 'error' },
    };
    expect(messages(pipelineGraphViolations(extraJoin))).toContain("node 'pattern' declares join with 1 parent(s)");
  });

  it("a 'prefer:' conflict rule must name a parent", () => {
    const p = base();
    (p.nodes[3] as any).join.merge.conflictRule = 'prefer:technical';
    expect(messages(pipelineGraphViolations(p))).toContain("does not name a parent of 'merge'");
    const ok = base();
    (ok.nodes[3] as any).join.merge.conflictRule = 'prefer:pattern';
    expect(pipelineGraphViolations(ok)).toEqual([]);
  });

  it('condition paths must be well-formed and reference declared nodes', () => {
    const p = base();
    (p.edges[0] as any).condition = { exists: '/nodes/ghost/output/x' };
    expect(messages(pipelineGraphViolations(p))).toContain("references undeclared node 'ghost'");

    const p2 = base();
    (p2.edges[0] as any).condition = { exists: '/bogus/root' };
    expect(messages(pipelineGraphViolations(p2))).toContain('not well-formed');

    const ok = base();
    (ok.edges[0] as any).condition = {
      all: [{ exists: '/context/symbol' }, { gte: { path: '/nodes/technical/output/atrPct', value: 0 } }],
    };
    expect(pipelineGraphViolations(ok)).toEqual([]);
  });

  it('timeout/retry bounds are re-checked semantically', () => {
    const p = base();
    (p.nodes[0] as any).timeoutMs = 0;
    (p.nodes[1] as any).maxRetries = -1;
    (p.nodes[2] as any).retryDelayMs = 1.5;
    const msgs = messages(pipelineGraphViolations(p));
    expect(msgs).toContain('timeoutMs must be an integer >= 1');
    expect(msgs).toContain('maxRetries must be an integer >= 0');
    expect(msgs).toContain('retryDelayMs must be an integer >= 0');
  });

  it("failurePolicy 'degrade' without explicit critical:false fails both layers", () => {
    const p = base();
    (p.nodes[0] as any).failurePolicy = 'degrade';
    expect(validateAgainstSchema('pipeline', p).ok).toBe(false);
    expect(messages(pipelineGraphViolations(p))).toContain("requires explicit critical:false");
  });

  it('every issue carries a JSON-pointer', () => {
    const p = base();
    (p as any).entry = 'ghost';
    for (const issue of pipelineGraphViolations(p)) {
      expect(issue.pointer.startsWith('/')).toBe(true);
    }
  });
});

describe('schema-layer negatives (strict AJV, pointered errors)', () => {
  it('missing required fields are rejected with instance pointers', () => {
    for (const field of ['schema', 'pipelineId', 'pipelineVersion', 'entry', 'nodes', 'edges']) {
      const p = base() as any;
      delete p[field];
      const result = validateAgainstSchema('pipeline', p);
      expect(result.ok, `missing ${field}`).toBe(false);
    }
  });

  it('wrong schema const, unknown category, malformed plugin refs and versions are rejected', () => {
    const wrongs: Array<(p: any) => void> = [
      (p) => (p.schema = 'afi.pipeline.v2'),
      (p) => (p.nodes[0].category = 'social'),
      (p) => (p.nodes[0].pluginId = '../evil/path'),
      (p) => (p.nodes[0].pluginVersion = 'v1.0.0'),
      (p) => (p.pipelineVersion = '1.0.0'),
      (p) => (p.nodes[0].extra = true),
      (p) => (p.edges[0].weight = 3),
      (p) => delete p.nodes[3].join.merge.conflictRule,
      (p) => (p.edges[0].condition = 'price > 100'),
      (p) => (p.edges[0].condition = { evaluate: 'code()' }),
      (p) => (p.nodes[0].timeoutMs = 0),
    ];
    for (const mutate of wrongs) {
      const p = base() as any;
      mutate(p);
      expect(validateAgainstSchema('pipeline', p).ok).toBe(false);
    }
  });

  it('schema errors carry JSON-pointer instance paths', () => {
    const p = base() as any;
    p.nodes[0].category = 'social';
    const result = validateAgainstSchema('pipeline', p);
    expect(result.errors.some((e) => e.pointer === '/nodes/0/category')).toBe(true);
  });
});

describe('plugin binding checks (fail closed on unknown identity)', () => {
  it('an unknown pluginId/version is an ERROR', () => {
    const p = base();
    (p.nodes[0] as any).pluginVersion = '9.9.9';
    const msgs = messages(pluginBindingViolations(p, plugins));
    expect(msgs).toContain("unknown plugin 'afi-analysis-technical@9.9.9'");
  });

  it('a category mismatch between node and plugin is rejected', () => {
    const p = base();
    (p.nodes[1] as any).pluginId = 'afi-analysis-sentiment';
    const msgs = messages(pluginBindingViolations(p, plugins));
    expect(msgs).toContain("does not match plugin 'afi-analysis-sentiment@1.0.0' category 'sentiment'");
  });

  it('node.config is validated against the bound paramsSchema (unknown + ill-typed params)', () => {
    const p = base();
    (p.nodes[0] as any).config = { candleLimit: 'many' };
    expect(messages(pluginBindingViolations(p, plugins))).toContain('config invalid against plugin');
    const p2 = base();
    (p2.nodes[0] as any).config = { unknownKnob: 1 };
    expect(messages(pluginBindingViolations(p2, plugins))).toContain('config invalid against plugin');
  });

  it('unbound required params are an error (required param missing from config)', () => {
    const strictPlugin = clone(plugins.find((x) => x.pluginId === 'afi-analysis-news')!);
    (strictPlugin.paramsSchema as any).required = ['windowHours'];
    const set = plugins.map((x) => (x.pluginId === 'afi-analysis-news' ? strictPlugin : x));
    const p = base();
    p.nodes.push({ id: 'news', category: 'news', pluginId: 'afi-analysis-news', pluginVersion: '1.0.0' } as any);
    p.edges.push({ from: 'technical', to: 'news' } as any, { from: 'news', to: 'merge' } as any);
    const msgs = messages(pluginBindingViolations(p, set));
    expect(msgs).toContain('config invalid against plugin');
  });

  it('repeated binding requires multiInstance:true', () => {
    const noMulti = clone(plugins);
    const tech = noMulti.find((x) => x.pluginId === 'afi-analysis-technical')!;
    (tech as any).multiInstance = false;
    const p = base();
    p.nodes.push({ id: 'technical2', category: 'technical', pluginId: 'afi-analysis-technical', pluginVersion: '1.0.0' } as any);
    p.edges.push({ from: 'technical', to: 'technical2' } as any, { from: 'technical2', to: 'merge' } as any);
    (p.nodes[3] as any).join = { policy: 'all', merge: { strategy: 'namespace-by-node', conflictRule: 'error' } };
    expect(messages(pluginBindingViolations(p, noMulti))).toContain('does not declare multiInstance:true');
    expect(messages(pluginBindingViolations(p, plugins))).not.toContain('multiInstance');
  });

  it('a failurePolicy outside permittedFailurePolicies is rejected', () => {
    const p = base();
    (p.nodes[3] as any).critical = false;
    (p.nodes[3] as any).failurePolicy = 'degrade'; // merge permits only 'abort'
    expect(messages(pluginBindingViolations(p, plugins))).toContain("failurePolicy 'degrade' is not permitted by plugin 'afi-merge-enriched-view@1.0.0'");
  });

  it('a mayFeedScorer:false plugin wired into the scorer is rejected', () => {
    const noFeed = clone(plugins);
    (noFeed.find((x) => x.pluginId === 'afi-merge-enriched-view') as any).mayFeedScorer = false;
    expect(messages(pluginBindingViolations(base(), noFeed))).toContain('mayFeedScorer:false');
  });

  it('category-level ordering constraints are enforced', () => {
    const constrained = clone(plugins);
    (constrained.find((x) => x.pluginId === 'afi-analysis-pattern') as any).orderingConstraints = {
      mustRunAfter: ['sentiment'],
    };
    expect(messages(pluginBindingViolations(base(), constrained))).toContain("mustRunAfter 'sentiment'");
  });
});

describe('analyst-config semantics + cross-artifact checks', () => {
  function config(pipeline: PipelineManifest): AnalystStrategyConfig {
    return {
      schema: 'afi.analyst-strategy-config.v1',
      analystId: 'tester',
      strategyId: 'semantic_base_v1',
      strategyVersion: '1.0.0',
      pipelineRef: {
        pipelineId: pipeline.pipelineId,
        pipelineVersion: pipeline.pipelineVersion,
        manifestHash: manifestHash(pipeline),
      },
      scorerRef: { pluginId: 'afi-scorer-froggy-trend-pullback', pluginVersion: '1.0.0' },
      uwrProfileRef: { profileId: 'uwr-weighted-lifts-v0.1' },
      decayConfig: { ref: { templateId: 'decay-swing-v1' } },
    };
  }

  it('a coherent config passes schema + semantics + cross-artifact checks', () => {
    const p = base();
    const result = validateDocument('analyst-strategy-config', config(p), { pipeline: p, plugins });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('strategyId embedded major must equal strategyVersion major', () => {
    const c = config(base());
    (c as any).strategyId = 'semantic_base_v2';
    expect(messages(analystConfigViolations(c))).toContain('embeds major v2');
  });

  it('a manifestHash divergence fails closed', () => {
    const p = base();
    const c = config(p);
    const tampered = clone(p);
    (tampered.nodes[0] as any).config = { candleLimit: 999 };
    const msgs = messages(analystConfigCrossViolations(c, tampered));
    expect(msgs).toContain('does not equal the manifest');
  });

  it('scorerRef must agree with the pipeline scorer binding', () => {
    const p = base();
    const c = config(p);
    (c.scorerRef as any).pluginVersion = '2.0.0';
    expect(messages(analystConfigCrossViolations(c, p))).toContain('does not equal the pipeline');
  });

  it('nodeOverrides must reference manifest nodes and validate override config', () => {
    const p = base();
    const c = config(p);
    (c as any).nodeOverrides = {
      ghost: { enabled: true },
      technical: { config: { candleLimit: 'many' } },
    };
    const msgs = messages(analystConfigCrossViolations(c, p, { plugins }));
    expect(msgs).toContain("override references node 'ghost'");
    expect(msgs).toContain('override config invalid');
  });

  it('disabling the entry, the scorer, or a graph-critical node fails closed', () => {
    const p = base();
    const c = config(p);
    (c as any).nodeOverrides = { technical: { enabled: false }, scorer: { enabled: false }, merge: { enabled: false } };
    const msgs = messages(analystConfigCrossViolations(c, p, { plugins }));
    expect(msgs).toContain('the entry node can never be disabled');
    expect(msgs).toContain('the scorer node can never be disabled');
    expect(msgs).toContain('scorer bypass');
  });

  it('disabling a fail-soft branch node is admissible', () => {
    const p = base();
    const c = config(p);
    (c as any).nodeOverrides = { sentiment: { enabled: false } };
    // sentiment -> merge: merge keeps pattern as a parent; graph stays admissible.
    expect(analystConfigCrossViolations(c, p, { plugins })).toEqual([]);
  });
});

describe('registration + provider-binding semantics', () => {
  it('registration strategyId/major disagreement is rejected', () => {
    const reg = {
      schema: 'afi.analyst-strategy-registration.v1',
      analystId: 'tester',
      strategyId: 'semantic_base_v2',
      strategyVersion: '1.0.0',
      analystConfigHash: {
        algorithm: 'sha256',
        canonicalizationVersion: 'afi.hash.v1',
        domainTag: 'afi.d2.analyst-config',
        value: 'a'.repeat(64),
      },
      configRef: 'templates/official/froggy-trend-pullback/analyst-config.json',
      providerBindingPolicy: { mode: 'any-authenticated' },
      status: 'active',
      registeredAt: '2026-07-16',
      registrationRef: 'test',
    };
    const result = validateDocument('analyst-strategy-registration', reg);
    expect(result.ok).toBe(false);
    expect(messages(result.errors)).toContain('embeds major v2');
  });

  it('provider-binding defaultStrategy must be a member of allowedStrategies', () => {
    const binding = {
      schema: 'afi.provider-strategy-binding.v1',
      bindingId: 'test-binding',
      providerId: 'tv-webhook-1',
      providerType: 'webhook',
      authenticatedBy: 'route-secret',
      allowedStrategies: [{ analystId: 'froggy', strategyId: 'trend_pullback_v1', strategyVersion: '1.0.0' }],
      defaultStrategy: { analystId: 'froggy', strategyId: 'trend_pullback_v1', strategyVersion: '1.0.1' },
      status: 'active',
    };
    const result = validateDocument('provider-strategy-binding', binding);
    expect(result.ok).toBe(false);
    expect(messages(result.errors)).toContain('defaultStrategy is not a member');
  });

  it('semanticViolations routes every kind', () => {
    expect(semanticViolations('composition-ref', {})).toEqual([]);
  });
});
