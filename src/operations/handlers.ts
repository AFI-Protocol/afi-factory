/**
 * The Factory domain operations — each wraps a REAL, already-shipped Factory
 * function (validateDocument, instantiateTemplate, inspectPipeline,
 * manifestHash/analystConfigHash/pluginSetHash, scaffoldPluginManifest/Contract)
 * or reads Factory's own vendored assets. No operation here re-describes
 * pipeline law: governed artifacts are validated deeply by the vendored schema
 * closure; input schemas describe only the operation's own envelope.
 *
 * Two honest failure channels:
 *   - an INVALID artifact is a successful VALIDATION RESULT (`valid:false` +
 *     JSON-pointer errors), returned by *.validate / *.instantiate;
 *   - an OPERATION error (unknown category/template, path escape, overwrite
 *     denied, malformed input) is thrown as OperationFailure and surfaced by the
 *     invoker as `ok:false` with a stable code.
 */
import { manifestHash, analystConfigHash, pluginSetHash } from '../canonical-json.js';
import { validateDocument, detectKind } from '../loader.js';
import { inspectPipeline } from '../inspect.js';
import { instantiateTemplate } from '../template.js';
import { scaffoldPluginManifest, scaffoldPluginContract, CATEGORIES, type PluginCategory } from '../scaffold.js';
import type { ValidationIssue } from '../schemas.js';
import type { PipelineManifest } from '../generated/pipeline.js';
import type { PipelineTemplate } from '../generated/pipeline-template.js';
import type { AnalysisPluginManifest } from '../generated/analysis-plugin.js';
import type { AnalystStrategyConfig } from '../generated/analyst-strategy-config.js';
import { skeletonTemplate, skeletonAnalystConfig, slotsToStrings } from '../authoring.js';
import { loadAllBundledOfficial, loadBundledOfficial, listBundledOfficialDirs } from './assets.js';
import { ERROR_CODES, OperationFailure } from './errors.js';
import { canonicalWorkspaceRoot, writeWorkspaceJson, writeWorkspaceText } from './workspace.js';
import type { OperationContext, OperationDef } from './types.js';

/** The five analyst-configurable analysis categories (governed set). */
export const ANALYSIS_CATEGORIES: readonly PluginCategory[] = [
  'technical',
  'pattern',
  'sentiment',
  'news',
  'aiMl',
];

// ---------------------------------------------------------------- schema bits
const ISSUE_SCHEMA = {
  type: 'object',
  required: ['pointer', 'message'],
  additionalProperties: true,
  properties: {
    pointer: { type: 'string' },
    message: { type: 'string' },
    keyword: { type: 'string' },
  },
} as const;

const ISSUES_ARRAY = { type: 'array', items: ISSUE_SCHEMA } as const;

/** A governed artifact envelope member — validated DEEPLY by the handler, not here. */
const ARTIFACT_OBJECT = { type: 'object' } as const;
const ARTIFACT_ARRAY = { type: 'array', items: { type: 'object' } } as const;

const VALIDATION_RESULT_SCHEMA = {
  type: 'object',
  required: ['valid', 'kind', 'errors'],
  additionalProperties: false,
  properties: {
    valid: { type: 'boolean' },
    kind: { type: 'string' },
    errors: ISSUES_ARRAY,
  },
} as const;

const CANONICAL_HASH_SCHEMA = {
  type: 'object',
  required: ['algorithm', 'canonicalizationVersion', 'domainTag', 'value'],
  additionalProperties: false,
  properties: {
    algorithm: { type: 'string' },
    canonicalizationVersion: { type: 'string' },
    domainTag: { type: 'string' },
    value: { type: 'string' },
  },
} as const;

// ---------------------------------------------------------------- helpers
/** Validates a caller-supplied plugin set element-wise; throws validation_failed on any invalid. */
function validatePluginSet(plugins: unknown): AnalysisPluginManifest[] | undefined {
  if (plugins === undefined) return undefined;
  if (!Array.isArray(plugins)) {
    throw new OperationFailure(ERROR_CODES.INVALID_INPUT, 'plugins must be an array of afi.analysis-plugin.v1 manifests');
  }
  const out: AnalysisPluginManifest[] = [];
  const issues: ValidationIssue[] = [];
  plugins.forEach((p, i) => {
    const r = validateDocument<AnalysisPluginManifest>('analysis-plugin', p);
    if (!r.ok) issues.push(...r.errors.map((e) => ({ ...e, pointer: `/plugins/${i}${e.pointer}` })));
    else out.push(r.document!);
  });
  if (issues.length) {
    throw new OperationFailure(ERROR_CODES.VALIDATION_FAILED, 'one or more supplied plugin manifests are invalid', issues);
  }
  return out;
}

function issuesFrom(errors: ValidationIssue[]): ValidationIssue[] {
  return errors.map((e) => ({ pointer: e.pointer, message: e.message, ...(e.keyword ? { keyword: e.keyword } : {}) }));
}

function pluginComponent(p: AnalysisPluginManifest) {
  return {
    pluginId: p.pluginId,
    pluginVersion: p.pluginVersion,
    implementationVersion: p.implementationVersion,
    category: p.category,
    description: p.description,
    inputSchemaRef: p.inputSchemaRef,
    outputSchemaRef: p.outputSchemaRef,
    deterministic: p.deterministic,
    capabilities: p.capabilities ?? [],
    paramsSchema: p.paramsSchema,
    multiInstance: p.multiInstance ?? false,
    mayFeedScorer: p.mayFeedScorer ?? false,
    isAnalysisCategory: (ANALYSIS_CATEGORIES as readonly string[]).includes(p.category),
    isScorer: p.category === 'scorer',
  };
}

// ==========================================================================
// The domain operation definitions.
//
// The literal array is NOT annotated `: OperationDef[]` directly: doing so
// would contextually type each handler's `input` as `unknown`, and strict
// function-type contravariance would then reject the concrete, narrower input
// types the handlers are authored with. Handler bodies are still fully
// type-checked against those narrower types; the erasing cast at the end
// publishes them as OperationDef. tests/operations.test.ts asserts every entry
// carries the full metadata contract (so the cast hides no missing field).
// ==========================================================================
const DOMAIN_OPERATION_LITERALS = [
  // ---------------------------------------------------------- plugins.list
  {
    operationId: 'factory.plugins.list',
    operationVersion: '1.1.0',
    name: 'List pipeline components',
    description:
      'Discover the analysis-plugin components composable into an AFI pipeline (from a supplied plugin set or Factory’s bundled official composition artifacts), with each plugin’s category, version, schema refs, determinism, params schema, multiInstance, and mayFeedScorer.',
    mutation: 'read-only',
    determinism: 'deterministic',
    fsPolicy: {
      readsWorkspace: false,
      writesWorkspace: false,
      readsBundledAssets: true,
      notes: 'Reads Factory’s bundled official composition plugin manifests when no plugin set is supplied.',
    },
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      properties: {
        plugins: { ...ARTIFACT_ARRAY, description: 'Inline analysis-plugin manifests to describe (validated).' },
        officialDir: { type: 'string', description: 'Bundled official composition id whose plugin set to list.' },
      },
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['components', 'categories', 'analysisCategories'],
      additionalProperties: false,
      properties: {
        components: { type: 'array', items: { type: 'object' } },
        categories: { type: 'array', items: { type: 'string' } },
        analysisCategories: { type: 'array', items: { type: 'string' } },
      },
    },
    handler: (input: { plugins?: unknown; officialDir?: string }) => {
      let plugins: AnalysisPluginManifest[];
      if (input.plugins !== undefined) {
        plugins = validatePluginSet(input.plugins) as AnalysisPluginManifest[];
      } else if (input.officialDir !== undefined) {
        const bundled = loadBundledOfficial(input.officialDir);
        if (!bundled) {
          throw new OperationFailure(
            ERROR_CODES.UNKNOWN_OFFICIAL,
            `no bundled official composition '${input.officialDir}' (have: ${listBundledOfficialDirs().join(', ') || 'none'})`
          );
        }
        plugins = bundled.plugins;
      } else {
        // Default: the union of all bundled official plugins, deduped by id@version.
        const seen = new Map<string, AnalysisPluginManifest>();
        for (const t of loadAllBundledOfficial()) {
          for (const p of t.plugins) seen.set(`${p.pluginId}@${p.pluginVersion}`, p);
        }
        plugins = [...seen.values()].sort((a, b) =>
          `${a.pluginId}@${a.pluginVersion}`.localeCompare(`${b.pluginId}@${b.pluginVersion}`)
        );
      }
      return {
        components: plugins.map(pluginComponent),
        categories: [...CATEGORIES],
        analysisCategories: [...ANALYSIS_CATEGORIES],
      };
    },
  },

  // --------------------------------------------------------- official.list
  {
    operationId: 'factory.official.list',
    operationVersion: '1.0.0',
    name: 'List bundled official compositions',
    description:
      'List the official composition artifact sets bundled with Factory (byte-identical copies of the canonical afi-config registry records), with their pipeline identity, analyst-strategy identity, canonical hash pins, and component counts.',
    mutation: 'read-only',
    determinism: 'deterministic',
    fsPolicy: {
      readsWorkspace: false,
      writesWorkspace: false,
      readsBundledAssets: true,
      notes: 'Reads Factory’s bundled official/ directory.',
    },
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      properties: {},
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['official'],
      additionalProperties: false,
      properties: { official: { type: 'array', items: { type: 'object' } } },
    },
    handler: () => ({
      official: loadAllBundledOfficial().map((t) => ({
        officialDir: t.officialDir,
        pipelineId: t.manifest.pipelineId,
        pipelineVersion: t.manifest.pipelineVersion,
        description: t.manifest.description,
        analystId: t.analystConfig.analystId,
        strategyId: t.analystConfig.strategyId,
        strategyVersion: t.analystConfig.strategyVersion,
        afiConfigCommit: t.hashes.afiConfigCommit,
        manifestHash: t.hashes.manifestHash,
        analystConfigHash: t.hashes.analystConfigHash,
        pluginSetHash: t.hashes.pluginSetHash,
        nodeCount: t.manifest.nodes.length,
        pluginCount: t.plugins.length,
      })),
    }),
  },

  // -------------------------------------------------------- template.create
  {
    operationId: 'factory.template.create',
    operationVersion: '1.0.0',
    name: 'Create template skeleton',
    description: 'Construct a minimal valid afi.pipeline-template.v1 skeleton (single technical stage into the scorer) and return it.',
    mutation: 'read-only',
    determinism: 'deterministic',
    fsPolicy: { readsWorkspace: false, writesWorkspace: false, readsBundledAssets: false, notes: 'Pure constructor; no I/O.' },
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      additionalProperties: false,
      properties: {
        templateId: { type: 'string' },
        pipelineId: { type: 'string' },
      },
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['template'],
      additionalProperties: false,
      properties: { template: ARTIFACT_OBJECT },
    },
    handler: (input: { templateId?: string; pipelineId?: string }) => {
      const doc = skeletonTemplate(input.templateId ?? 'my-template', input.pipelineId ?? 'my-pipeline');
      const result = validateDocument('pipeline-template', doc);
      if (!result.ok) {
        throw new OperationFailure(ERROR_CODES.INTERNAL_ERROR, 'generated template failed validation (bug)', issuesFrom(result.errors));
      }
      return { template: doc };
    },
  },

  // ------------------------------------------------------ template.validate
  {
    operationId: 'factory.template.validate',
    operationVersion: '1.0.0',
    name: 'Validate template',
    description: 'Strict schema + declared-slots validation of an afi.pipeline-template.v1 document.',
    mutation: 'read-only',
    determinism: 'deterministic',
    fsPolicy: { readsWorkspace: false, writesWorkspace: false, readsBundledAssets: false, notes: 'Validates an inline document; no I/O.' },
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['template'],
      additionalProperties: false,
      properties: { template: ARTIFACT_OBJECT },
    },
    outputSchema: { $schema: 'http://json-schema.org/draft-07/schema#', ...VALIDATION_RESULT_SCHEMA },
    handler: (input: { template: unknown }) => {
      const r = validateDocument('pipeline-template', input.template);
      return { valid: r.ok, kind: r.kind, errors: issuesFrom(r.errors) };
    },
  },

  // ------------------------------------------------------- template.inspect
  {
    operationId: 'factory.template.inspect',
    operationVersion: '1.0.0',
    name: 'Inspect template topology',
    description: 'Return execution order, parallel waves, node table, and join/condition summary of a template’s topology (slots shown as $param:<name>). Fails closed on an invalid template.',
    mutation: 'read-only',
    determinism: 'deterministic',
    fsPolicy: { readsWorkspace: false, writesWorkspace: false, readsBundledAssets: false, notes: 'Inspects an inline document; no I/O.' },
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['template'],
      additionalProperties: false,
      properties: { template: ARTIFACT_OBJECT },
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['inspection'],
      additionalProperties: false,
      properties: { inspection: { type: 'object' } },
    },
    handler: (input: { template: unknown }) => {
      const r = validateDocument<PipelineTemplate>('pipeline-template', input.template);
      if (!r.ok) {
        throw new OperationFailure(ERROR_CODES.VALIDATION_FAILED, 'cannot inspect an invalid template', issuesFrom(r.errors));
      }
      const display = slotsToStrings(r.document) as PipelineManifest;
      return { inspection: inspectPipeline(display) };
    },
  },

  // --------------------------------------------------- template.instantiate
  {
    operationId: 'factory.template.instantiate',
    operationVersion: '1.0.0',
    name: 'Instantiate template',
    description: 'Resolve template parameters into a concrete, fully validated afi.pipeline.v1 manifest (fail closed), and return it with its canonical manifest hash.',
    mutation: 'read-only',
    determinism: 'deterministic',
    fsPolicy: { readsWorkspace: false, writesWorkspace: false, readsBundledAssets: false, notes: 'Pure; returns the instantiated manifest inline (no write).' },
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['template'],
      additionalProperties: false,
      properties: {
        template: ARTIFACT_OBJECT,
        params: { type: 'object', description: 'Parameter values keyed by parameter name.' },
        plugins: { ...ARTIFACT_ARRAY, description: 'Plugin manifests for binding checks (validated).' },
      },
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['valid', 'errors'],
      additionalProperties: false,
      properties: {
        valid: { type: 'boolean' },
        errors: ISSUES_ARRAY,
        pipeline: ARTIFACT_OBJECT,
        manifestHash: CANONICAL_HASH_SCHEMA,
      },
    },
    handler: (input: { template: unknown; params?: Record<string, unknown>; plugins?: unknown }) => {
      const t = validateDocument<PipelineTemplate>('pipeline-template', input.template);
      if (!t.ok) return { valid: false, errors: issuesFrom(t.errors) };
      const plugins = validatePluginSet(input.plugins);
      const inst = instantiateTemplate(t.document!, input.params ?? {}, { plugins });
      if (!inst.ok) return { valid: false, errors: issuesFrom(inst.errors) };
      return { valid: true, errors: [], pipeline: inst.pipeline, manifestHash: manifestHash(inst.pipeline!) };
    },
  },

  // ------------------------------------------------------ pipeline.validate
  {
    operationId: 'factory.pipeline.validate',
    operationVersion: '1.0.0',
    name: 'Validate pipeline',
    description: 'Strict schema + graph-semantic validation of an afi.pipeline.v1 manifest (plus category/plugin binding checks when a plugin set is supplied).',
    mutation: 'read-only',
    determinism: 'deterministic',
    fsPolicy: { readsWorkspace: false, writesWorkspace: false, readsBundledAssets: false, notes: 'Validates an inline document; no I/O.' },
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['pipeline'],
      additionalProperties: false,
      properties: {
        pipeline: ARTIFACT_OBJECT,
        plugins: { ...ARTIFACT_ARRAY, description: 'Plugin manifests for binding checks (validated).' },
      },
    },
    outputSchema: { $schema: 'http://json-schema.org/draft-07/schema#', ...VALIDATION_RESULT_SCHEMA },
    handler: (input: { pipeline: unknown; plugins?: unknown }) => {
      const plugins = validatePluginSet(input.plugins);
      const r = validateDocument('pipeline', input.pipeline, { plugins });
      return { valid: r.ok, kind: r.kind, errors: issuesFrom(r.errors) };
    },
  },

  // ------------------------------------------------------- pipeline.inspect
  {
    operationId: 'factory.pipeline.inspect',
    operationVersion: '1.0.0',
    name: 'Inspect pipeline topology',
    description: 'Return execution order, parallel waves (Kahn levels), the node table, and join/condition summaries of a valid afi.pipeline.v1 manifest. Fails closed on an invalid manifest.',
    mutation: 'read-only',
    determinism: 'deterministic',
    fsPolicy: { readsWorkspace: false, writesWorkspace: false, readsBundledAssets: false, notes: 'Inspects an inline document; no I/O.' },
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['pipeline'],
      additionalProperties: false,
      properties: { pipeline: ARTIFACT_OBJECT },
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['inspection'],
      additionalProperties: false,
      properties: { inspection: { type: 'object' } },
    },
    handler: (input: { pipeline: unknown }) => {
      const r = validateDocument<PipelineManifest>('pipeline', input.pipeline);
      if (!r.ok) {
        throw new OperationFailure(ERROR_CODES.VALIDATION_FAILED, 'cannot inspect an invalid pipeline', issuesFrom(r.errors));
      }
      return { inspection: inspectPipeline(r.document!) };
    },
  },

  // -------------------------------------------------- analystConfig.create
  {
    operationId: 'factory.analystConfig.create',
    operationVersion: '1.0.0',
    name: 'Create analyst-strategy config',
    description: 'Construct an afi.analyst-strategy-config.v1 skeleton pinned (by canonical hash) to a given pipeline manifest, and return it validated.',
    mutation: 'read-only',
    determinism: 'deterministic',
    fsPolicy: { readsWorkspace: false, writesWorkspace: false, readsBundledAssets: false, notes: 'Pure constructor; no I/O.' },
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['pipeline'],
      additionalProperties: false,
      properties: {
        pipeline: ARTIFACT_OBJECT,
        analystId: { type: 'string' },
        strategyId: { type: 'string' },
        strategyVersion: { type: 'string' },
        uwrProfileId: { type: 'string' },
        decayTemplateId: { type: 'string' },
      },
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['valid', 'config', 'errors'],
      additionalProperties: false,
      properties: {
        valid: { type: 'boolean' },
        config: ARTIFACT_OBJECT,
        errors: ISSUES_ARRAY,
        analystConfigHash: CANONICAL_HASH_SCHEMA,
      },
    },
    handler: (input: {
      pipeline: unknown;
      analystId?: string;
      strategyId?: string;
      strategyVersion?: string;
      uwrProfileId?: string;
      decayTemplateId?: string;
    }) => {
      const p = validateDocument<PipelineManifest>('pipeline', input.pipeline);
      if (!p.ok) {
        throw new OperationFailure(ERROR_CODES.VALIDATION_FAILED, 'referenced pipeline is invalid', issuesFrom(p.errors));
      }
      const config = skeletonAnalystConfig(p.document!, {
        analystId: input.analystId,
        strategyId: input.strategyId,
        strategyVersion: input.strategyVersion,
        uwrProfileId: input.uwrProfileId,
        decayTemplateId: input.decayTemplateId,
      });
      const r = validateDocument('analyst-strategy-config', config, { pipeline: p.document });
      if (!r.ok) return { valid: false, config, errors: issuesFrom(r.errors) };
      return { valid: true, config, errors: [], analystConfigHash: analystConfigHash(config) };
    },
  },

  // ------------------------------------------------ analystConfig.validate
  {
    operationId: 'factory.analystConfig.validate',
    operationVersion: '1.0.0',
    name: 'Validate analyst-strategy config',
    description: 'Strict schema + semantic validation of an afi.analyst-strategy-config.v1 document, with cross-artifact checks against a referenced pipeline and/or plugin set when supplied.',
    mutation: 'read-only',
    determinism: 'deterministic',
    fsPolicy: { readsWorkspace: false, writesWorkspace: false, readsBundledAssets: false, notes: 'Validates inline documents; no I/O.' },
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['config'],
      additionalProperties: false,
      properties: {
        config: ARTIFACT_OBJECT,
        pipeline: { ...ARTIFACT_OBJECT, description: 'Referenced pipeline manifest for cross-artifact checks.' },
        plugins: { ...ARTIFACT_ARRAY, description: 'Plugin manifests for override-config checks (validated).' },
      },
    },
    outputSchema: { $schema: 'http://json-schema.org/draft-07/schema#', ...VALIDATION_RESULT_SCHEMA },
    handler: (input: { config: unknown; pipeline?: unknown; plugins?: unknown }) => {
      let pipeline: PipelineManifest | undefined;
      if (input.pipeline !== undefined) {
        const pr = validateDocument<PipelineManifest>('pipeline', input.pipeline);
        if (!pr.ok) {
          throw new OperationFailure(ERROR_CODES.VALIDATION_FAILED, 'referenced pipeline is invalid', issuesFrom(pr.errors));
        }
        pipeline = pr.document;
      }
      const plugins = validatePluginSet(input.plugins);
      const r = validateDocument('analyst-strategy-config', input.config, { pipeline, plugins });
      return { valid: r.ok, kind: r.kind, errors: issuesFrom(r.errors) };
    },
  },

  // ---------------------------------------------------------- plugin.scaffold
  {
    operationId: 'factory.plugin.scaffold',
    operationVersion: '1.0.0',
    name: 'Scaffold analysis plugin',
    description: 'Generate an afi.analysis-plugin.v1 manifest skeleton plus a TypeScript implementation-contract stub, written into the approved workspace.',
    mutation: 'mutating',
    determinism: 'environment-dependent',
    fsPolicy: { readsWorkspace: false, writesWorkspace: true, readsBundledAssets: false, notes: 'Writes <dir>/<id>.plugin.json and <dir>/<id>.contract.ts inside the workspace root.' },
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['pluginId', 'category'],
      additionalProperties: false,
      properties: {
        pluginId: { type: 'string', description: 'lowercase alphanumeric + hyphens' },
        category: { type: 'string', enum: [...CATEGORIES] },
        dir: { type: 'string', description: 'workspace-relative output directory (default ".")' },
        overwrite: { type: 'boolean', description: 'allow overwriting existing files (default false)' },
      },
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['written', 'manifest'],
      additionalProperties: false,
      properties: {
        written: { type: 'array', items: { type: 'string' } },
        manifest: ARTIFACT_OBJECT,
      },
    },
    handler: (input: { pluginId: string; category: string; dir?: string; overwrite?: boolean }, ctx: OperationContext) => {
      if (!(CATEGORIES as readonly string[]).includes(input.category)) {
        throw new OperationFailure(ERROR_CODES.UNKNOWN_CATEGORY, `unknown category '${input.category}' (expected one of: ${CATEGORIES.join(', ')})`);
      }
      const root = canonicalWorkspaceRoot(ctx.workspace);
      const allowOverwrite = input.overwrite ?? ctx.workspace?.allowOverwrite ?? false;
      let manifest: AnalysisPluginManifest;
      try {
        manifest = scaffoldPluginManifest({ pluginId: input.pluginId, category: input.category as PluginCategory });
      } catch (e) {
        throw new OperationFailure(ERROR_CODES.INVALID_INPUT, (e as Error).message);
      }
      const check = validateDocument('analysis-plugin', manifest);
      if (!check.ok) {
        throw new OperationFailure(ERROR_CODES.INTERNAL_ERROR, 'generated plugin manifest failed validation (bug)', issuesFrom(check.errors));
      }
      const dir = input.dir ?? '.';
      const contract = scaffoldPluginContract({ pluginId: input.pluginId, category: input.category as PluginCategory });
      const wManifest = writeWorkspaceJson(root, `${dir}/${input.pluginId}.plugin.json`, manifest, allowOverwrite);
      const wContract = writeWorkspaceText(root, `${dir}/${input.pluginId}.contract.ts`, contract, allowOverwrite);
      return { written: [wManifest, wContract], manifest };
    },
  },

  // ------------------------------------------------------------ artifact.hash
  {
    operationId: 'factory.artifact.hash',
    operationVersion: '1.0.0',
    name: 'Canonical hash',
    description: 'Compute the canonical-json-hashing.v1 hash of a pipeline manifest, analyst-config, or plugin-set. The artifact is fully validated first (refuses to hash invalid input).',
    mutation: 'read-only',
    determinism: 'deterministic',
    fsPolicy: { readsWorkspace: false, writesWorkspace: false, readsBundledAssets: false, notes: 'Pure; hashes an inline artifact.' },
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['artifact'],
      additionalProperties: false,
      properties: {
        artifact: { type: ['object', 'array'], description: 'A pipeline manifest, analyst-config, or an array of plugin manifests (plugin-set).' },
        kind: { type: 'string', enum: ['pipeline', 'analyst-config', 'plugin-set'] },
      },
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['kind', 'hash'],
      additionalProperties: false,
      properties: { kind: { type: 'string' }, hash: CANONICAL_HASH_SCHEMA },
    },
    handler: (input: { artifact: unknown; kind?: string }) => {
      let kind = input.kind;
      if (!kind) {
        if (Array.isArray(input.artifact)) kind = 'plugin-set';
        else {
          const detected = detectKind(input.artifact);
          if (detected === 'pipeline') kind = 'pipeline';
          else if (detected === 'analyst-strategy-config') kind = 'analyst-config';
          else throw new OperationFailure(ERROR_CODES.INVALID_INPUT, 'cannot detect hash kind; pass kind = pipeline | analyst-config | plugin-set');
        }
      }
      switch (kind) {
        case 'pipeline': {
          const r = validateDocument<PipelineManifest>('pipeline', input.artifact);
          if (!r.ok) throw new OperationFailure(ERROR_CODES.VALIDATION_FAILED, 'refusing to hash an invalid pipeline manifest', issuesFrom(r.errors));
          return { kind, hash: manifestHash(r.document!) };
        }
        case 'analyst-config': {
          const r = validateDocument<AnalystStrategyConfig>('analyst-strategy-config', input.artifact);
          if (!r.ok) throw new OperationFailure(ERROR_CODES.VALIDATION_FAILED, 'refusing to hash an invalid analyst-config', issuesFrom(r.errors));
          return { kind, hash: analystConfigHash(r.document!) };
        }
        case 'plugin-set': {
          if (!Array.isArray(input.artifact)) throw new OperationFailure(ERROR_CODES.INVALID_INPUT, 'kind=plugin-set expects an array of afi.analysis-plugin.v1 documents');
          const plugins = validatePluginSet(input.artifact) as AnalysisPluginManifest[];
          return { kind, hash: pluginSetHash(plugins) };
        }
        default:
          throw new OperationFailure(ERROR_CODES.INVALID_INPUT, `unknown kind '${kind}'`);
      }
    },
  },

  // --------------------------------------------------------- artifact.package
  {
    operationId: 'factory.artifact.package',
    operationVersion: '1.0.0',
    name: 'Package deployment artifacts',
    description: 'Validate a pipeline manifest (and optional analyst-config + plugin set), then write a deterministic, deployment-ready artifact bundle (manifest, analyst-config, plugins, hashes.json) into the approved workspace.',
    mutation: 'mutating',
    determinism: 'environment-dependent',
    fsPolicy: { readsWorkspace: false, writesWorkspace: true, readsBundledAssets: false, notes: 'Writes <dir>/{pipeline.manifest.json,analyst-config.json,plugins/*.json,hashes.json} inside the workspace root. Validates everything before writing anything.' },
    inputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['pipeline', 'dir'],
      additionalProperties: false,
      properties: {
        pipeline: ARTIFACT_OBJECT,
        analystConfig: ARTIFACT_OBJECT,
        plugins: ARTIFACT_ARRAY,
        dir: { type: 'string', description: 'workspace-relative output directory for the bundle' },
        overwrite: { type: 'boolean' },
      },
    },
    outputSchema: {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      required: ['written', 'hashes'],
      additionalProperties: false,
      properties: {
        written: { type: 'array', items: { type: 'string' } },
        hashes: {
          type: 'object',
          required: ['manifestHash'],
          additionalProperties: false,
          properties: {
            manifestHash: CANONICAL_HASH_SCHEMA,
            analystConfigHash: CANONICAL_HASH_SCHEMA,
            pluginSetHash: CANONICAL_HASH_SCHEMA,
          },
        },
      },
    },
    handler: (
      input: { pipeline: unknown; analystConfig?: unknown; plugins?: unknown; dir: string; overwrite?: boolean },
      ctx: OperationContext
    ) => {
      const root = canonicalWorkspaceRoot(ctx.workspace);
      const allowOverwrite = input.overwrite ?? ctx.workspace?.allowOverwrite ?? false;
      // Validate EVERYTHING before writing anything (fail closed, no partial bundle).
      const plugins = validatePluginSet(input.plugins) as AnalysisPluginManifest[] | undefined;
      const p = validateDocument<PipelineManifest>('pipeline', input.pipeline, { plugins });
      if (!p.ok) throw new OperationFailure(ERROR_CODES.VALIDATION_FAILED, 'refusing to package an invalid pipeline manifest', issuesFrom(p.errors));
      const manifest = p.document!;
      let config: AnalystStrategyConfig | undefined;
      if (input.analystConfig !== undefined) {
        const c = validateDocument<AnalystStrategyConfig>('analyst-strategy-config', input.analystConfig, { pipeline: manifest, plugins });
        if (!c.ok) throw new OperationFailure(ERROR_CODES.VALIDATION_FAILED, 'refusing to package an invalid analyst-config', issuesFrom(c.errors));
        config = c.document;
      }
      const hashes: Record<string, unknown> = { manifestHash: manifestHash(manifest) };
      if (config) hashes.analystConfigHash = analystConfigHash(config);
      if (plugins && plugins.length) hashes.pluginSetHash = pluginSetHash(plugins);

      const dir = input.dir;
      const written: string[] = [];
      written.push(writeWorkspaceJson(root, `${dir}/pipeline.manifest.json`, manifest, allowOverwrite));
      if (config) written.push(writeWorkspaceJson(root, `${dir}/analyst-config.json`, config, allowOverwrite));
      if (plugins) {
        for (const pl of plugins) {
          written.push(writeWorkspaceJson(root, `${dir}/plugins/${pl.pluginId}.plugin.json`, pl, allowOverwrite));
        }
      }
      written.push(
        writeWorkspaceJson(
          root,
          `${dir}/hashes.json`,
          {
            $comment: 'Canonical hashes computed by afi-factory (canonical-json-hashing.v1; domain tags per D-FCP-7).',
            artifacts: {
              pipelineManifest: 'pipeline.manifest.json',
              ...(config ? { analystConfig: 'analyst-config.json' } : {}),
              ...(plugins && plugins.length ? { plugins: 'plugins' } : {}),
            },
            ...hashes,
          },
          allowOverwrite
        )
      );
      return { written, hashes };
    },
  },
];

export const DOMAIN_OPERATIONS: OperationDef[] = DOMAIN_OPERATION_LITERALS as unknown as OperationDef[];
