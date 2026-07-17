/**
 * Read-only access to Factory's OWN vendored package assets: the bundled
 * official templates under `templates/official/`. These paths are fixed and
 * derived from `import.meta.url` — a caller can never redirect them, so reading
 * them is deterministic and safe (analogous to loadGovernedSchema). This is NOT
 * a workspace reader and NOT an arbitrary file reader.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import type { AnalysisPluginManifest } from '../generated/analysis-plugin.js';
import type { PipelineTemplate } from '../generated/pipeline-template.js';

/** Absolute path to the package root (two levels up from src/operations/). */
const PACKAGE_ROOT = fileURLToPath(new URL('../../', import.meta.url));
const OFFICIAL_DIR = join(PACKAGE_ROOT, 'templates', 'official');

export interface BundledTemplate {
  /** Directory name under templates/official/ (stable id used by operations). */
  templateDir: string;
  template: PipelineTemplate;
  plugins: AnalysisPluginManifest[];
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf-8')) as T;
}

/** Lists the bundled official template directories (sorted, deterministic). */
export function listBundledTemplateDirs(): string[] {
  if (!existsSync(OFFICIAL_DIR)) return [];
  return readdirSync(OFFICIAL_DIR)
    .filter((d) => statSync(join(OFFICIAL_DIR, d)).isDirectory())
    .sort();
}

/** Loads one bundled official template (+ its plugin set) by directory id. */
export function loadBundledTemplate(templateDir: string): BundledTemplate | undefined {
  if (!listBundledTemplateDirs().includes(templateDir)) return undefined;
  const base = join(OFFICIAL_DIR, templateDir);
  const template = readJson<PipelineTemplate>(join(base, 'template.json'));
  const pluginsDir = join(base, 'plugins');
  const plugins = existsSync(pluginsDir)
    ? readdirSync(pluginsDir)
        .filter((f) => f.endsWith('.json'))
        .sort()
        .map((f) => readJson<AnalysisPluginManifest>(join(pluginsDir, f)))
    : [];
  return { templateDir, template, plugins };
}

/** Loads every bundled official template (sorted by directory id). */
export function loadAllBundledTemplates(): BundledTemplate[] {
  return listBundledTemplateDirs()
    .map((d) => loadBundledTemplate(d))
    .filter((t): t is BundledTemplate => t !== undefined);
}
