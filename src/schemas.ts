/**
 * Strict AJV validation over the vendored governed schema closure
 * (src/governed-schema/, byte-pinned to the afi-config commit recorded in
 * MANIFEST.json and enforced by tests/governed-schema-drift.test.ts).
 *
 * All vendored schemas are preloaded so cross-schema $refs (the CanonicalHash
 * reference) resolve locally — never over the network.
 */
import { readFileSync } from 'node:fs';
import AjvModule, { type ValidateFunction, type ErrorObject } from 'ajv';
import addFormatsModule from 'ajv-formats';

// ajv/ajv-formats ship CJS; under NodeNext the callable/constructable value is
// the module's `default` at type level while Node's ESM-CJS interop already
// returns it at runtime. Normalize once, safely for both shapes.
type AjvClass = typeof AjvModule.default;
export type Ajv = InstanceType<AjvClass>;
const Ajv: AjvClass =
  (AjvModule as unknown as { default?: AjvClass }).default ?? (AjvModule as unknown as AjvClass);
type AddFormats = typeof addFormatsModule.default;
const addFormats: AddFormats =
  (addFormatsModule as unknown as { default?: AddFormats }).default ??
  (addFormatsModule as unknown as AddFormats);

const GOVERNED_SCHEMA_DIR = new URL('./governed-schema/', import.meta.url);

export function loadGovernedSchema(basename: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(basename, GOVERNED_SCHEMA_DIR), 'utf-8'));
}

export type ArtifactKind =
  | 'pipeline'
  | 'pipeline-template'
  | 'analysis-plugin'
  | 'analyst-strategy-config'
  | 'analyst-strategy-registration'
  | 'provider-strategy-binding'
  | 'composition-ref';

export const ARTIFACT_KINDS: readonly ArtifactKind[] = [
  'pipeline',
  'pipeline-template',
  'analysis-plugin',
  'analyst-strategy-config',
  'analyst-strategy-registration',
  'provider-strategy-binding',
  'composition-ref',
];

const KIND_TO_FILE: Record<ArtifactKind, string> = {
  pipeline: 'pipeline.schema.json',
  'pipeline-template': 'pipeline-template.schema.json',
  'analysis-plugin': 'analysis-plugin.schema.json',
  'analyst-strategy-config': 'analyst-strategy-config.schema.json',
  'analyst-strategy-registration': 'analyst-strategy-registration.schema.json',
  'provider-strategy-binding': 'provider-strategy-binding.schema.json',
  'composition-ref': 'composition-ref.schema.json',
};

export const KIND_TO_SCHEMA_ID: Record<ArtifactKind, string> = {
  pipeline: 'afi.pipeline.v1',
  'pipeline-template': 'afi.pipeline-template.v1',
  'analysis-plugin': 'afi.analysis-plugin.v1',
  'analyst-strategy-config': 'afi.analyst-strategy-config.v1',
  'analyst-strategy-registration': 'afi.analyst-strategy-registration.v1',
  'provider-strategy-binding': 'afi.provider-strategy-binding.v1',
  'composition-ref': 'afi.composition-ref.v1',
};

/** Strict AJV instance with the x-afi* governed vocabulary registered. */
export function createAjv(): Ajv {
  const ajv = new Ajv({
    strict: true,
    allowUnionTypes: true,
    strictRequired: false,
    allErrors: true,
  });
  addFormats(ajv);
  ajv.addVocabulary([
    'x-afiStatus',
    'x-afiPartOf',
    'x-afiDoctrineRefs',
    'x-afiOpenItems',
    'x-afiProposedNotAccepted',
    'x-afiConstraints',
  ]);
  return ajv;
}

/**
 * Lenient AJV for OPEN schema fragments authored inside artifacts
 * (plugin paramsSchema, template parameter schema fragments) — those are
 * arbitrary draft-07 fragments, not governed contracts.
 */
export function createFragmentAjv(): Ajv {
  const ajv = new Ajv({ strict: false, allowUnionTypes: true, allErrors: true });
  addFormats(ajv);
  return ajv;
}

let cachedAjv: Ajv | undefined;
const compiled = new Map<ArtifactKind, ValidateFunction>();

function ajvWithClosure(): Ajv {
  if (!cachedAjv) {
    cachedAjv = createAjv();
    // Preload the whole vendored closure so absolute $refs resolve locally.
    for (const file of Object.values(KIND_TO_FILE)) cachedAjv.addSchema(loadGovernedSchema(file));
    cachedAjv.addSchema(loadGovernedSchema('canonical-hash.schema.json'));
  }
  return cachedAjv;
}

export function validatorFor(kind: ArtifactKind): ValidateFunction {
  let v = compiled.get(kind);
  if (!v) {
    const schema = loadGovernedSchema(KIND_TO_FILE[kind]);
    const byId = ajvWithClosure().getSchema(String(schema.$id));
    if (!byId) throw new Error(`governed schema for kind '${kind}' failed to load`);
    v = byId;
    compiled.set(kind, v);
  }
  return v;
}

export interface ValidationIssue {
  /** JSON-pointer into the offending document ('' = document root). */
  pointer: string;
  message: string;
  keyword?: string;
}

export function ajvErrorsToIssues(errors: ErrorObject[] | null | undefined): ValidationIssue[] {
  return (errors ?? []).map((e) => ({
    pointer: e.instancePath || '',
    message:
      (e.message ?? 'schema violation') +
      (e.keyword === 'additionalProperties' && (e.params as { additionalProperty?: string }).additionalProperty
        ? ` ('${(e.params as { additionalProperty: string }).additionalProperty}')`
        : ''),
    keyword: e.keyword,
  }));
}

export interface SchemaValidationResult {
  ok: boolean;
  errors: ValidationIssue[];
}

/** Strict schema-layer validation of one artifact document. */
export function validateAgainstSchema(kind: ArtifactKind, doc: unknown): SchemaValidationResult {
  const validate = validatorFor(kind);
  const ok = validate(doc) as boolean;
  return { ok, errors: ok ? [] : ajvErrorsToIssues(validate.errors) };
}

/** Detects the artifact kind from the document's `schema` discriminator. */
export function detectKind(doc: unknown): ArtifactKind | undefined {
  if (doc === null || typeof doc !== 'object') return undefined;
  const schema = (doc as { schema?: unknown }).schema;
  if (typeof schema !== 'string') return undefined;
  return (Object.entries(KIND_TO_SCHEMA_ID).find(([, id]) => id === schema)?.[0] ?? undefined) as
    | ArtifactKind
    | undefined;
}
