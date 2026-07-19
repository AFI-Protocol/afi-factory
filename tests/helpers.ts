import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { AnalysisPluginManifest } from '../src/generated/analysis-plugin.js';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));
export const officialDir = join(repoRoot, 'official', 'froggy-trend-pullback');
export const conformanceDir = join(repoRoot, 'fixtures', 'conformance');

export function readJson<T = any>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8'));
}

export function officialPlugins(): AnalysisPluginManifest[] {
  const dir = join(officialDir, 'plugins');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => readJson<AnalysisPluginManifest>(join(dir, f)));
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * A self-contained, clearly non-production proof template exercising the
 * afi.pipeline-template.v1 value-parameterization contract over the CURRENT
 * canonical plugin identities. Templates parameterize values, never topology;
 * provider selection (providerInstanceRef) is authored at the manifest layer,
 * so the official provider-backed composition is not template-produced.
 */
export function proofTemplate(): any {
  return {
    schema: 'afi.pipeline-template.v1',
    templateId: 'proof-two-stage',
    templateVersion: 'v1.0.0',
    description:
      'TEST TEMPLATE (non-production): value-parameterized two-stage proof graph over the current canonical plugin identities.',
    parameters: [
      {
        name: 'candleLimit',
        schema: { type: 'integer', minimum: 1, maximum: 1000 },
        required: false,
        default: 100,
        description: 'Candles fetched by the technical stage.',
      },
      {
        name: 'newsWindowHours',
        schema: { type: 'integer', minimum: 1, maximum: 168 },
        required: false,
        default: 4,
        description: 'Look-back window (hours) for the news stage.',
      },
    ],
    pipelineId: 'proof-two-stage',
    pipelineVersion: 'v1.0.0',
    entry: 'technical',
    nodes: [
      {
        id: 'technical',
        category: 'technical',
        pluginId: 'afi-analysis-technical',
        pluginVersion: '2.0.0',
        config: { candleLimit: { $param: 'candleLimit' } },
      },
      {
        id: 'news',
        category: 'news',
        pluginId: 'afi-analysis-news',
        pluginVersion: '2.0.0',
        config: { windowHours: { $param: 'newsWindowHours' } },
      },
      {
        id: 'scorer',
        category: 'scorer',
        pluginId: 'afi-scorer-froggy-trend-pullback',
        pluginVersion: '1.0.0',
      },
    ],
    edges: [
      { from: 'technical', to: 'news' },
      { from: 'news', to: 'scorer' },
    ],
  };
}
