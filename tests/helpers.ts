import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { AnalysisPluginManifest } from '../src/generated/analysis-plugin.js';

export const repoRoot = fileURLToPath(new URL('..', import.meta.url));
export const officialDir = join(repoRoot, 'templates', 'official', 'froggy-trend-pullback');
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
