/**
 * Read-only access to Factory's OWN vendored package assets: the bundled
 * official composition artifact sets under `official/`. Each set carries
 * byte-identical copies of the canonical afi-config registry records — the
 * registered pipeline manifest, the analyst-strategy config, the bound plugin
 * manifests — plus the committed canonical hash pins (`hashes.json`). These
 * paths are fixed and derived from `import.meta.url` — a caller can never
 * redirect them, so reading them is deterministic and safe (analogous to
 * loadGovernedSchema). This is NOT a workspace reader and NOT an arbitrary
 * file reader.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { AnalysisPluginManifest } from '../generated/analysis-plugin.js';
import type { PipelineManifest } from '../generated/pipeline.js';
import type { AnalystStrategyConfig } from '../generated/analyst-strategy-config.js';

/** Absolute path to the package root (two levels up from src/operations/). */
const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OFFICIAL_DIR = join(PACKAGE_ROOT, 'official');

export interface BundledOfficialArtifacts {
  /** Directory name under official/ (stable id used by operations). */
  officialDir: string;
  manifest: PipelineManifest;
  analystConfig: AnalystStrategyConfig;
  plugins: AnalysisPluginManifest[];
  /** Committed canonical hash pins (afiConfigCommit + manifest/config/plugin-set hashes). */
  hashes: Record<string, unknown>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

/** Lists the bundled official composition directories (sorted, deterministic). */
export function listBundledOfficialDirs(): string[] {
  if (!existsSync(OFFICIAL_DIR)) return [];
  return readdirSync(OFFICIAL_DIR)
    .filter((d) => statSync(join(OFFICIAL_DIR, d)).isDirectory())
    .sort();
}

/** Loads one bundled official composition artifact set by directory id. */
export function loadBundledOfficial(officialDir: string): BundledOfficialArtifacts | undefined {
  if (!listBundledOfficialDirs().includes(officialDir)) return undefined;
  const base = join(OFFICIAL_DIR, officialDir);
  const manifest = readJson<PipelineManifest>(join(base, 'pipeline.manifest.json'));
  const analystConfig = readJson<AnalystStrategyConfig>(join(base, 'analyst-config.json'));
  const hashes = readJson<Record<string, unknown>>(join(base, 'hashes.json'));
  const pluginsDir = join(base, 'plugins');
  const plugins = existsSync(pluginsDir)
    ? readdirSync(pluginsDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => readJson<AnalysisPluginManifest>(join(pluginsDir, f)))
    : [];
  return { officialDir, manifest, analystConfig, plugins, hashes };
}

/** Loads every bundled official composition artifact set (sorted by directory id). */
export function loadAllBundledOfficial(): BundledOfficialArtifacts[] {
  return listBundledOfficialDirs()
    .map((d) => loadBundledOfficial(d))
    .filter((t): t is BundledOfficialArtifacts => t !== undefined);
}
