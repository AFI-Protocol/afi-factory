/**
 * Codegen library: derives the committed TypeScript types under src/generated/
 * from the vendored governed schemas under src/governed-schema/.
 *
 * NO hand-written type mirrors: every contract type is generated from the
 * byte-pinned schema closure. The generation is re-executed by
 * tests/codegen-freshness.test.ts and byte-compared against the committed
 * output, so the generated files can never drift from the vendored schemas.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { compile } from 'json-schema-to-typescript';

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(here, '..', 'src', 'governed-schema');

const CANONICAL_HASH_URL =
  'https://afi-protocol.org/schemas/provenance/v1/canonical-hash.schema.json';

/** file basename -> generated root type name */
export const GENERATED = {
  'pipeline.schema.json': { out: 'pipeline.ts', name: 'PipelineManifest' },
  'pipeline-template.schema.json': { out: 'pipeline-template.ts', name: 'PipelineTemplate' },
  'analysis-plugin.schema.json': { out: 'analysis-plugin.ts', name: 'AnalysisPluginManifest' },
  'analyst-strategy-config.schema.json': {
    out: 'analyst-strategy-config.ts',
    name: 'AnalystStrategyConfig',
  },
  'analyst-strategy-registration.schema.json': {
    out: 'analyst-strategy-registration.ts',
    name: 'AnalystStrategyRegistration',
  },
  'provider-strategy-binding.schema.json': {
    out: 'provider-strategy-binding.ts',
    name: 'ProviderStrategyBinding',
  },
  'composition-ref.schema.json': { out: 'composition-ref.ts', name: 'CompositionRef' },
  'canonical-hash.schema.json': { out: 'canonical-hash.ts', name: 'CanonicalHash' },
};

function loadSchema(basename) {
  return JSON.parse(readFileSync(join(schemaDir, basename), 'utf-8'));
}

/** Strip fields that would perturb generated identifier names. */
function prepare(schema) {
  const clone = JSON.parse(JSON.stringify(schema));
  delete clone.$id;
  delete clone.title;
  return clone;
}

/**
 * Rewrite the absolute canonical-hash $ref to a local definition so codegen
 * never fetches over the network and the generated name is stable.
 */
function inlineCanonicalHashRef(schema, canonicalHashSchema) {
  let replaced = false;
  const walk = (x) => {
    if (Array.isArray(x)) {
      x.forEach(walk);
      return;
    }
    if (x && typeof x === 'object') {
      if (x.$ref === CANONICAL_HASH_URL) {
        x.$ref = '#/definitions/canonicalHash';
        replaced = true;
      }
      Object.values(x).forEach(walk);
    }
  };
  walk(schema);
  if (replaced) {
    schema.definitions = schema.definitions ?? {};
    schema.definitions.canonicalHash = {
      ...prepare(canonicalHashSchema),
      title: 'canonicalHash',
    };
  }
  return schema;
}

const BANNER = `/* GENERATED FILE — DO NOT EDIT.
 * Derived from the vendored governed schema closure (src/governed-schema/)
 * by scripts/codegen.mjs (json-schema-to-typescript). Regenerate with
 * \`npm run codegen\`; freshness is enforced by tests/codegen-freshness.test.ts.
 */`;

/** @returns {Promise<Record<string, string>>} out filename -> file content */
export async function generateAll() {
  const canonicalHashSchema = loadSchema('canonical-hash.schema.json');
  const out = {};
  for (const [basename, { out: outFile, name }] of Object.entries(GENERATED)) {
    const schema = inlineCanonicalHashRef(prepare(loadSchema(basename)), canonicalHashSchema);
    out[outFile] = await compile(schema, name, {
      bannerComment: BANNER,
      additionalProperties: false,
      cwd: schemaDir,
      format: true,
    });
  }
  return out;
}
