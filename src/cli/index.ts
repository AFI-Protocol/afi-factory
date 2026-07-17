#!/usr/bin/env node
/**
 * afi-factory CLI — authoring-side tooling for the afi.pipeline.v1 contract
 * family. Every command executes REAL validation (strict AJV over the
 * vendored governed schemas + the semantic graph layer) before reporting
 * validity; invalid input always exits nonzero; --json emits
 * machine-readable output; errors carry JSON-pointer paths.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { Command } from 'commander';
import {
  validateDocument,
  type LoadAndValidateResult,
  type LoadAndValidateOptions,
} from '../loader.js';
import type { ValidationIssue, ArtifactKind } from '../schemas.js';
import { detectKind } from '../schemas.js';
import { manifestHash, analystConfigHash, pluginSetHash } from '../canonical-json.js';
import { inspectPipeline, renderInspection } from '../inspect.js';
import { instantiateTemplate } from '../template.js';
import { scaffoldPluginManifest, scaffoldPluginContract, CATEGORIES, type PluginCategory } from '../scaffold.js';
import type { PipelineManifest } from '../generated/pipeline.js';
import type { PipelineTemplate } from '../generated/pipeline-template.js';
import type { AnalysisPluginManifest } from '../generated/analysis-plugin.js';
import type { AnalystStrategyConfig } from '../generated/analyst-strategy-config.js';
import type { CanonicalHash } from '../generated/canonical-hash.js';
import { skeletonTemplate, slotsToStrings } from '../authoring.js';
import { OPERATIONS } from '../operations/registry.js';
import { buildCapabilityCatalog, catalogHash } from '../agent/catalog.js';
import { buildToolDefinitions } from '../agent/tools.js';
import { serveMcpStdio } from '../agent/mcp.js';

const program = new Command();

class CliError extends Error {
  constructor(
    message: string,
    public errors: ValidationIssue[] = []
  ) {
    super(message);
  }
}

function readJsonFile(file: string): unknown {
  let raw: string;
  try {
    raw = readFileSync(file, 'utf-8');
  } catch (e) {
    throw new CliError(`cannot read '${file}': ${(e as Error).message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new CliError(`invalid JSON in '${file}': ${(e as Error).message}`);
  }
}

function printIssues(prefix: string, errors: ValidationIssue[]): void {
  process.stderr.write(`${prefix}\n`);
  for (const e of errors) process.stderr.write(`  ${e.pointer || '/'} — ${e.message}\n`);
}

function reportValidation(
  file: string,
  result: LoadAndValidateResult,
  json: boolean,
  extra: Record<string, unknown> = {}
): void {
  if (json) {
    process.stdout.write(
      JSON.stringify({ valid: result.ok, kind: result.kind, file, errors: result.errors, ...extra }, null, 2) + '\n'
    );
  } else if (result.ok) {
    process.stdout.write(`VALID ${result.kind}: ${file}\n`);
  } else {
    printIssues(`INVALID ${result.kind}: ${file} (${result.errors.length} error(s))`, result.errors);
  }
  if (!result.ok) process.exitCode = 1;
}

/** Loads and validates a plugin-manifest set from files and/or directories. */
function loadPluginSet(paths: string[] | undefined): AnalysisPluginManifest[] | undefined {
  if (!paths || paths.length === 0) return undefined;
  const files: string[] = [];
  for (const p of paths) {
    const full = resolve(p);
    if (!existsSync(full)) throw new CliError(`--plugins path '${p}' does not exist`);
    if (statSync(full).isDirectory()) {
      for (const f of readdirSync(full).sort()) {
        if (f.endsWith('.json')) files.push(join(full, f));
      }
    } else {
      files.push(full);
    }
  }
  const plugins: AnalysisPluginManifest[] = [];
  for (const file of files) {
    const doc = readJsonFile(file);
    const result = validateDocument<AnalysisPluginManifest>('analysis-plugin', doc);
    if (!result.ok) {
      throw new CliError(
        `plugin manifest '${file}' is invalid against afi.analysis-plugin.v1`,
        result.errors
      );
    }
    plugins.push(result.document!);
  }
  return plugins;
}

function validateFile(
  kind: ArtifactKind,
  file: string,
  options: LoadAndValidateOptions
): LoadAndValidateResult {
  return validateDocument(kind, readJsonFile(file), options);
}

function writeJson(file: string, doc: unknown): void {
  mkdirSync(dirname(resolve(file)), { recursive: true });
  writeFileSync(file, JSON.stringify(doc, null, 2) + '\n');
}

function parseParamValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

function collectParams(paramsFile: string | undefined, pairs: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (paramsFile) {
    const doc = readJsonFile(paramsFile);
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
      throw new CliError(`--params file '${paramsFile}' must contain a JSON object`);
    }
    Object.assign(out, doc);
  }
  for (const pair of pairs) {
    const eq = pair.indexOf('=');
    if (eq <= 0) throw new CliError(`--param '${pair}' must be <name>=<value>`);
    out[pair.slice(0, eq)] = parseParamValue(pair.slice(eq + 1));
  }
  return out;
}

function printHash(hash: CanonicalHash, label: string, json: boolean): void {
  if (json) process.stdout.write(JSON.stringify(hash, null, 2) + '\n');
  else
    process.stdout.write(
      `${label} ${hash.value}\n  domainTag=${hash.domainTag} algorithm=${hash.algorithm} canonicalizationVersion=${hash.canonicalizationVersion}\n`
    );
}

program
  .name('afi-factory')
  .description(
    'AFI pipeline authoring: template authoring/instantiation, manifest validation, canonical hashing, graph inspection, plugin scaffolding (governed contracts vendored from afi-config)'
  )
  .version('1.0.0');

// ---------------------------------------------------------------- pipeline
const pipeline = program.command('pipeline').description('afi.pipeline.v1 manifest operations');

pipeline
  .command('validate')
  .argument('<file>', 'pipeline manifest JSON file')
  .option('--plugins <paths...>', 'plugin manifest files/directories for binding checks')
  .option('--json', 'machine-readable output')
  .description('schema + graph-semantic validation (plus plugin binding checks when --plugins given)')
  .action((file: string, opts: { plugins?: string[]; json?: boolean }) => {
    const plugins = loadPluginSet(opts.plugins);
    reportValidation(file, validateFile('pipeline', file, { plugins }), !!opts.json);
  });

pipeline
  .command('inspect')
  .argument('<file>', 'pipeline manifest JSON file')
  .option('--json', 'machine-readable output')
  .description('execution order, parallel waves (Kahn levels), node table, join/condition summary')
  .action((file: string, opts: { json?: boolean }) => {
    const result = validateFile('pipeline', file, {});
    if (!result.ok) {
      reportValidation(file, result, !!opts.json);
      return;
    }
    const inspection = inspectPipeline(result.document as PipelineManifest);
    if (opts.json) process.stdout.write(JSON.stringify(inspection, null, 2) + '\n');
    else process.stdout.write(renderInspection(inspection) + '\n');
  });

// ---------------------------------------------------------------- template
const template = program.command('template').description('afi.pipeline-template.v1 operations');

template
  .command('create')
  .argument('<file>', 'output template JSON file')
  .option('--template-id <id>', 'templateId', 'my-template')
  .option('--pipeline-id <id>', 'pipelineId of instantiations', 'my-pipeline')
  .option('--json', 'machine-readable output')
  .description('write a minimal valid template skeleton (technical -> scorer)')
  .action((file: string, opts: { templateId: string; pipelineId: string; json?: boolean }) => {
    const doc = skeletonTemplate(opts.templateId, opts.pipelineId);
    const result = validateDocument('pipeline-template', doc);
    if (!result.ok) throw new CliError('generated template failed validation (bug)', result.errors);
    writeJson(file, doc);
    if (opts.json) process.stdout.write(JSON.stringify({ created: [file] }, null, 2) + '\n');
    else process.stdout.write(`created ${file}\n`);
  });

template
  .command('validate')
  .argument('<file>', 'template JSON file')
  .option('--json', 'machine-readable output')
  .description('schema + declared-slots validation')
  .action((file: string, opts: { json?: boolean }) => {
    reportValidation(file, validateFile('pipeline-template', file, {}), !!opts.json);
  });

template
  .command('inspect')
  .argument('<file>', 'template JSON file')
  .option('--json', 'machine-readable output')
  .description('graph inspection of the (concrete) template topology; slots shown as $param:<name>')
  .action((file: string, opts: { json?: boolean }) => {
    const result = validateFile('pipeline-template', file, {});
    if (!result.ok) {
      reportValidation(file, result, !!opts.json);
      return;
    }
    const display = slotsToStrings(result.document) as PipelineManifest;
    const inspection = inspectPipeline(display);
    if (opts.json) process.stdout.write(JSON.stringify(inspection, null, 2) + '\n');
    else process.stdout.write(renderInspection(inspection) + '\n');
  });

template
  .command('instantiate')
  .argument('<file>', 'template JSON file')
  .option('--params <file>', 'JSON object file of parameter values')
  .option('-p, --param <name=value...>', 'individual parameter value (JSON or string)', [])
  .option('--plugins <paths...>', 'plugin manifest files/directories for binding checks')
  .option('--out <file>', 'write the instantiated afi.pipeline.v1 manifest here')
  .option('--json', 'machine-readable output')
  .description('resolve parameters -> concrete, fully validated afi.pipeline.v1 manifest (fail closed)')
  .action(
    (
      file: string,
      opts: { params?: string; param: string[]; plugins?: string[]; out?: string; json?: boolean }
    ) => {
      const tResult = validateFile('pipeline-template', file, {});
      if (!tResult.ok) {
        reportValidation(file, tResult, !!opts.json);
        return;
      }
      const supplied = collectParams(opts.params, opts.param);
      const plugins = loadPluginSet(opts.plugins);
      const inst = instantiateTemplate(tResult.document as PipelineTemplate, supplied, { plugins });
      if (!inst.ok) {
        if (opts.json)
          process.stdout.write(JSON.stringify({ valid: false, errors: inst.errors }, null, 2) + '\n');
        else printIssues(`INSTANTIATION FAILED: ${file} (${inst.errors.length} error(s))`, inst.errors);
        process.exitCode = 1;
        return;
      }
      const hash = manifestHash(inst.pipeline!);
      if (opts.out) writeJson(opts.out, inst.pipeline);
      if (opts.json) {
        process.stdout.write(
          JSON.stringify(
            { valid: true, manifestHash: hash, ...(opts.out ? { out: opts.out } : { pipeline: inst.pipeline }) },
            null,
            2
          ) + '\n'
        );
      } else {
        if (opts.out) process.stdout.write(`instantiated -> ${opts.out}\n`);
        else process.stdout.write(JSON.stringify(inst.pipeline, null, 2) + '\n');
        printHash(hash, 'manifestHash', false);
      }
    }
  );

// ---------------------------------------------------------- analyst-config
const analystConfig = program
  .command('analyst-config')
  .description('afi.analyst-strategy-config.v1 operations');

analystConfig
  .command('create')
  .argument('<file>', 'output analyst-config JSON file')
  .requiredOption('--pipeline <file>', 'the pipeline manifest this config pins (hash is computed)')
  .option('--analyst-id <id>', 'analystId', 'my-analyst')
  .option('--strategy-id <id>', 'strategyId (snake_case with _v<major>)', 'my_strategy_v0')
  .option('--strategy-version <semver>', 'strategyVersion (no v prefix)', '0.1.0')
  .option('--uwr-profile <id>', 'uwrProfileRef.profileId', 'uwr-weighted-lifts-v0.1')
  .option('--decay-template <id>', 'decayConfig.ref.templateId', 'decay-swing-v1')
  .option('--json', 'machine-readable output')
  .description('write an analyst-config skeleton pinned (by canonical hash) to the given pipeline')
  .action(
    (
      file: string,
      opts: {
        pipeline: string;
        analystId: string;
        strategyId: string;
        strategyVersion: string;
        uwrProfile: string;
        decayTemplate: string;
        json?: boolean;
      }
    ) => {
      const pResult = validateFile('pipeline', opts.pipeline, {});
      if (!pResult.ok) {
        reportValidation(opts.pipeline, pResult, !!opts.json);
        return;
      }
      const manifest = pResult.document as PipelineManifest;
      const scorer = manifest.nodes.find((n) => n.category === 'scorer')!;
      const doc: AnalystStrategyConfig = {
        schema: 'afi.analyst-strategy-config.v1',
        analystId: opts.analystId,
        strategyId: opts.strategyId,
        strategyVersion: opts.strategyVersion,
        pipelineRef: {
          pipelineId: manifest.pipelineId,
          pipelineVersion: manifest.pipelineVersion,
          manifestHash: manifestHash(manifest),
        },
        scorerRef: { pluginId: scorer.pluginId, pluginVersion: scorer.pluginVersion },
        uwrProfileRef: { profileId: opts.uwrProfile },
        decayConfig: { ref: { templateId: opts.decayTemplate } },
      };
      const result = validateDocument('analyst-strategy-config', doc, { pipeline: manifest });
      if (!result.ok) throw new CliError('generated analyst-config failed validation', result.errors);
      writeJson(file, doc);
      if (opts.json) process.stdout.write(JSON.stringify({ created: [file] }, null, 2) + '\n');
      else process.stdout.write(`created ${file}\n`);
    }
  );

analystConfig
  .command('validate')
  .argument('<file>', 'analyst-config JSON file')
  .option('--pipeline <file>', 'referenced pipeline manifest for cross-artifact checks')
  .option('--plugins <paths...>', 'plugin manifest files/directories for override config checks')
  .option('--json', 'machine-readable output')
  .description('schema + semantic validation (cross-artifact checks when --pipeline given)')
  .action((file: string, opts: { pipeline?: string; plugins?: string[]; json?: boolean }) => {
    let pipelineDoc: PipelineManifest | undefined;
    if (opts.pipeline) {
      const pResult = validateFile('pipeline', opts.pipeline, {});
      if (!pResult.ok) {
        reportValidation(opts.pipeline, pResult, !!opts.json);
        return;
      }
      pipelineDoc = pResult.document as PipelineManifest;
    }
    const plugins = loadPluginSet(opts.plugins);
    reportValidation(
      file,
      validateFile('analyst-strategy-config', file, { pipeline: pipelineDoc, plugins }),
      !!opts.json
    );
  });

// ------------------------------------------------------------------ plugin
const plugin = program.command('plugin').description('afi.analysis-plugin.v1 operations');

plugin
  .command('scaffold')
  .requiredOption('--id <pluginId>', 'pluginId (lowercase alphanumeric + hyphens)')
  .requiredOption('--category <category>', `one of: ${CATEGORIES.join(', ')}`)
  .option('--dir <dir>', 'output directory', '.')
  .option('--json', 'machine-readable output')
  .description('generate a new analysis-plugin manifest skeleton + implementation contract stub')
  .action((opts: { id: string; category: string; dir: string; json?: boolean }) => {
    if (!CATEGORIES.includes(opts.category as PluginCategory)) {
      throw new CliError(`unknown category '${opts.category}' (expected one of: ${CATEGORIES.join(', ')})`);
    }
    const manifest = scaffoldPluginManifest({ pluginId: opts.id, category: opts.category as PluginCategory });
    const result = validateDocument('analysis-plugin', manifest);
    if (!result.ok) throw new CliError('generated plugin manifest failed validation (bug)', result.errors);
    const manifestFile = join(opts.dir, `${opts.id}.plugin.json`);
    const contractFile = join(opts.dir, `${opts.id}.contract.ts`);
    mkdirSync(resolve(opts.dir), { recursive: true });
    writeJson(manifestFile, manifest);
    writeFileSync(contractFile, scaffoldPluginContract({ pluginId: opts.id, category: opts.category as PluginCategory }));
    if (opts.json) process.stdout.write(JSON.stringify({ created: [manifestFile, contractFile] }, null, 2) + '\n');
    else process.stdout.write(`created ${manifestFile}\ncreated ${contractFile}\n`);
  });

// -------------------------------------------------------------------- hash
program
  .command('hash')
  .argument('<file>', 'artifact JSON file (or, for plugin-set, a JSON array of plugin manifests)')
  .option('--kind <kind>', "one of: pipeline | analyst-config | plugin-set (default: detect from the document's schema)")
  .option('--json', 'emit the full CanonicalHash object')
  .description('canonical hash per canonical-json-hashing.v1 — the artifact is fully validated first')
  .action((file: string, opts: { kind?: string; json?: boolean }) => {
    const doc = readJsonFile(file);
    let kind = opts.kind;
    if (!kind) {
      if (Array.isArray(doc)) kind = 'plugin-set';
      else {
        const detected = detectKind(doc);
        if (detected === 'pipeline') kind = 'pipeline';
        else if (detected === 'analyst-strategy-config') kind = 'analyst-config';
        else throw new CliError(`cannot detect hash kind for '${file}'; pass --kind pipeline|analyst-config|plugin-set`);
      }
    }
    switch (kind) {
      case 'pipeline': {
        const result = validateDocument('pipeline', doc);
        if (!result.ok) throw new CliError(`refusing to hash invalid pipeline manifest '${file}'`, result.errors);
        printHash(manifestHash(result.document as PipelineManifest), 'manifestHash', !!opts.json);
        return;
      }
      case 'analyst-config': {
        const result = validateDocument('analyst-strategy-config', doc);
        if (!result.ok) throw new CliError(`refusing to hash invalid analyst-config '${file}'`, result.errors);
        printHash(analystConfigHash(result.document as AnalystStrategyConfig), 'analystConfigHash', !!opts.json);
        return;
      }
      case 'plugin-set': {
        if (!Array.isArray(doc)) throw new CliError('--kind plugin-set expects a JSON array of afi.analysis-plugin.v1 documents');
        const plugins: AnalysisPluginManifest[] = [];
        for (const [i, entry] of doc.entries()) {
          const result = validateDocument<AnalysisPluginManifest>('analysis-plugin', entry);
          if (!result.ok) {
            throw new CliError(
              `refusing to hash: plugin-set entry ${i} is invalid against afi.analysis-plugin.v1`,
              result.errors.map((e) => ({ ...e, pointer: `/${i}${e.pointer}` }))
            );
          }
          plugins.push(result.document!);
        }
        printHash(pluginSetHash(plugins), 'pluginSetHash', !!opts.json);
        return;
      }
      default:
        throw new CliError(`unknown --kind '${kind}' (expected pipeline | analyst-config | plugin-set)`);
    }
  });

// -------------------------------------------------------------------- init
program
  .command('init')
  .argument('<dir>', 'new pipeline project directory')
  .option('--pipeline-id <id>', 'pipelineId', 'my-pipeline')
  .option('--analyst-id <id>', 'analystId', 'my-analyst')
  .option('--json', 'machine-readable output')
  .description('scaffold a pipeline project: template + instantiated manifest + analyst-config + plugin skeletons')
  .action((dir: string, opts: { pipelineId: string; analystId: string; json?: boolean }) => {
    if (existsSync(dir) && readdirSync(dir).length > 0) {
      throw new CliError(`directory '${dir}' exists and is not empty`);
    }
    const technicalPlugin = scaffoldPluginManifest({ pluginId: 'my-technical', category: 'technical' });
    const scorerPlugin = scaffoldPluginManifest({ pluginId: 'my-scorer', category: 'scorer' });
    const templateDoc = skeletonTemplate(`${opts.pipelineId}-template`, opts.pipelineId);
    const tCheck = validateDocument('pipeline-template', templateDoc);
    if (!tCheck.ok) throw new CliError('generated template failed validation (bug)', tCheck.errors);
    const inst = instantiateTemplate(templateDoc as unknown as PipelineTemplate, {}, {
      plugins: [technicalPlugin, scorerPlugin],
    });
    if (!inst.ok) throw new CliError('generated template failed instantiation (bug)', inst.errors);
    const manifest = inst.pipeline!;
    const config: AnalystStrategyConfig = {
      schema: 'afi.analyst-strategy-config.v1',
      analystId: opts.analystId,
      strategyId: 'my_strategy_v0',
      strategyVersion: '0.1.0',
      pipelineRef: {
        pipelineId: manifest.pipelineId,
        pipelineVersion: manifest.pipelineVersion,
        manifestHash: manifestHash(manifest),
      },
      scorerRef: { pluginId: 'my-scorer', pluginVersion: '0.1.0' },
      uwrProfileRef: { profileId: 'uwr-weighted-lifts-v0.1' },
      decayConfig: { ref: { templateId: 'decay-swing-v1' } },
    };
    const cCheck = validateDocument('analyst-strategy-config', config, { pipeline: manifest });
    if (!cCheck.ok) throw new CliError('generated analyst-config failed validation (bug)', cCheck.errors);

    const created: string[] = [];
    const put = (rel: string, doc: unknown) => {
      const full = join(dir, rel);
      writeJson(full, doc);
      created.push(full);
    };
    put('plugins/my-technical.plugin.json', technicalPlugin);
    put('plugins/my-scorer.plugin.json', scorerPlugin);
    put('template.json', templateDoc);
    put('pipeline.manifest.json', manifest);
    put('analyst-config.json', config);
    const readme = `# ${opts.pipelineId}

Scaffolded by \`afi-factory init\`. Contents:

- \`template.json\` — afi.pipeline-template.v1 (edit the graph here)
- \`pipeline.manifest.json\` — instantiated afi.pipeline.v1 manifest
- \`analyst-config.json\` — afi.analyst-strategy-config.v1 pinned to the manifest's canonical hash
- \`plugins/\` — afi.analysis-plugin.v1 skeletons (edit contracts, then re-validate)

Re-validate after every edit (the analyst-config manifestHash pin fails closed
if the manifest changes):

\`\`\`sh
afi-factory template validate template.json
afi-factory template instantiate template.json --plugins plugins --out pipeline.manifest.json
afi-factory pipeline validate pipeline.manifest.json --plugins plugins
afi-factory analyst-config validate analyst-config.json --pipeline pipeline.manifest.json --plugins plugins
\`\`\`
`;
    const readmeFile = join(dir, 'README.md');
    mkdirSync(dir, { recursive: true });
    writeFileSync(readmeFile, readme);
    created.push(readmeFile);
    if (opts.json) process.stdout.write(JSON.stringify({ created }, null, 2) + '\n');
    else created.forEach((f) => process.stdout.write(`created ${f}\n`));
  });

// ---------------------------------------------------------- capabilities
// (skeletonTemplate + slotsToStrings now live in ../authoring.js — one source,
// shared with the agent operation handlers.)
program
  .command('capabilities')
  .option('--json', 'emit the deterministic machine-readable capability catalog')
  .option('--tools', 'emit the generic (framework-neutral) agent tool definitions')
  .option('--hash', 'emit only the deterministic catalog hash')
  .description('Factory agent capability catalog — the implementation-backed operation registry')
  .action((opts: { json?: boolean; tools?: boolean; hash?: boolean }) => {
    const catalog = buildCapabilityCatalog(OPERATIONS);
    if (opts.hash) {
      process.stdout.write(catalogHash(catalog) + '\n');
      return;
    }
    if (opts.tools) {
      process.stdout.write(JSON.stringify(buildToolDefinitions(OPERATIONS), null, 2) + '\n');
      return;
    }
    if (opts.json) {
      process.stdout.write(JSON.stringify(catalog, null, 2) + '\n');
      return;
    }
    process.stdout.write(
      `Factory capability catalog v${catalog.catalogVersion} (hash ${catalogHash(catalog)})\n`
    );
    for (const op of catalog.operations) {
      process.stdout.write(`  ${op.operationId}  [${op.mutation}/${op.determinism}]  ${op.name}\n`);
    }
  });

// ---------------------------------------------------------------- agent
const agent = program.command('agent').description('agent-facing Factory surfaces');

agent
  .command('serve')
  .option('--transport <kind>', 'transport (only "stdio" is supported)', 'stdio')
  .option('--workspace <dir>', 'workspace root; mutating operations write ONLY inside it')
  .description('serve the Factory operation registry to an agent over an MCP-compatible stdio transport')
  .action(async (opts: { transport: string; workspace?: string }) => {
    if (opts.transport !== 'stdio') {
      throw new CliError(`unsupported transport '${opts.transport}' (only "stdio" is supported)`);
    }
    const workspace = opts.workspace ? { root: opts.workspace } : undefined;
    await new Promise<void>((resolvePromise) => {
      serveMcpStdio({
        input: process.stdin,
        output: process.stdout,
        workspace,
        onClose: () => resolvePromise(),
      });
      process.stdin.resume();
    });
  });

// ----------------------------------------------------------------- run
try {
  await program.parseAsync(process.argv);
} catch (e) {
  if (e instanceof CliError) {
    printIssues(`ERROR: ${e.message}`, e.errors);
    process.exitCode = 1;
  } else {
    throw e;
  }
}
