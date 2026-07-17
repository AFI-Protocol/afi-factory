/**
 * The Factory operation registry + invoker — the single dispatch point every
 * surface (SDK, CLI, MCP adapter) calls. Input is validated against the
 * operation's declared input schema BEFORE the handler runs; output is
 * validated against its declared output schema AFTER. Domain failures raised by
 * handlers are normalized into the OperationError envelope. Unknown ids fail
 * closed. Read-only handlers never touch the filesystem; mutating handlers
 * enforce the workspace boundary internally.
 */
import type { ValidateFunction } from 'ajv';
import { createFragmentAjv, ajvErrorsToIssues, type ValidationIssue } from '../schemas.js';
import { ERROR_CODES, OperationFailure } from './errors.js';
import { DOMAIN_OPERATIONS } from './handlers.js';
import type { OperationContext, OperationDef, OperationResult } from './types.js';
import { buildCapabilityCatalog, catalogHash } from '../agent/catalog.js';

const DRAFT07 = 'http://json-schema.org/draft-07/schema#';

/**
 * factory.capabilities.list — defined here (not in handlers.ts) because it
 * projects over the assembled OPERATIONS registry, which includes itself.
 */
const capabilitiesOp: OperationDef = {
  operationId: 'factory.capabilities.list',
  operationVersion: '1.0.0',
  name: 'List Factory capabilities',
  description:
    'Return the deterministic Factory capability catalog: every agent-operable authoring operation with its input/output schemas, mutability, filesystem policy, determinism, and error contract.',
  mutation: 'read-only',
  determinism: 'deterministic',
  fsPolicy: {
    readsWorkspace: false,
    writesWorkspace: false,
    readsBundledAssets: false,
    notes: 'Pure; derived from the in-memory operation registry.',
  },
  inputSchema: { $schema: DRAFT07, type: 'object', additionalProperties: false, properties: {} },
  outputSchema: {
    $schema: DRAFT07,
    type: 'object',
    required: ['catalogVersion', 'catalogHash', 'operations'],
    additionalProperties: false,
    properties: {
      catalogVersion: { type: 'string' },
      catalogHash: { type: 'string' },
      operations: { type: 'array', items: { type: 'object' } },
    },
  },
  handler: () => {
    const catalog = buildCapabilityCatalog(OPERATIONS);
    return {
      catalogVersion: catalog.catalogVersion,
      catalogHash: catalogHash(catalog),
      operations: catalog.operations,
    };
  },
};

/** The complete registry (capabilities.list first, then the domain operations). */
export const OPERATIONS: OperationDef[] = [capabilitiesOp, ...DOMAIN_OPERATIONS];

const OPERATIONS_BY_ID: Map<string, OperationDef> = new Map(OPERATIONS.map((op) => [op.operationId, op]));

/** Returns the operation definition for `id`, or undefined. */
export function getOperation(id: string): OperationDef | undefined {
  return OPERATIONS_BY_ID.get(id);
}

/** Returns every registered operation id (sorted). */
export function listOperationIds(): string[] {
  return [...OPERATIONS_BY_ID.keys()].sort();
}

// -- input/output schema validation (compiled once per operation+direction) --
const ajv = createFragmentAjv();
const compiled = new Map<string, ValidateFunction>();

function validatorFor(op: OperationDef, dir: 'in' | 'out'): ValidateFunction {
  const key = `${op.operationId}:${dir}`;
  let v = compiled.get(key);
  if (!v) {
    v = ajv.compile(dir === 'in' ? op.inputSchema : op.outputSchema);
    compiled.set(key, v);
  }
  return v;
}

function validateWith(op: OperationDef, dir: 'in' | 'out', value: unknown): ValidationIssue[] {
  const validate = validatorFor(op, dir);
  return validate(value) ? [] : ajvErrorsToIssues(validate.errors);
}

/**
 * Executes a specific operation def: validate input → run handler → validate
 * output → normalize errors. Never throws. Exposed so the input/output-contract
 * guard is directly testable (a handler whose output violates its declared
 * schema must surface as `invalid_output`).
 */
export async function executeOperation(
  op: OperationDef,
  rawInput: unknown = {},
  ctx: OperationContext = {}
): Promise<OperationResult> {
  const input = rawInput ?? {};
  const inputIssues = validateWith(op, 'in', input);
  if (inputIssues.length) {
    return { ok: false, error: { code: ERROR_CODES.INVALID_INPUT, message: `input failed schema for '${op.operationId}'`, issues: inputIssues } };
  }
  let output: unknown;
  try {
    output = await op.handler(input, ctx);
  } catch (e) {
    if (e instanceof OperationFailure) {
      return { ok: false, error: { code: e.code, message: e.message, ...(e.issues ? { issues: e.issues } : {}) } };
    }
    return { ok: false, error: { code: ERROR_CODES.INTERNAL_ERROR, message: (e as Error).message } };
  }
  const outputIssues = validateWith(op, 'out', output);
  if (outputIssues.length) {
    return {
      ok: false,
      error: { code: ERROR_CODES.INVALID_OUTPUT, message: `handler output failed its declared schema for '${op.operationId}'`, issues: outputIssues },
    };
  }
  return { ok: true, output };
}

/**
 * Invokes an operation by id with a raw input envelope. Never throws to the
 * caller: every outcome is an OperationResult (ok + output, or ok:false + a
 * normalized OperationError). Unknown ids fail closed.
 */
export async function invokeOperation(
  operationId: string,
  rawInput: unknown = {},
  ctx: OperationContext = {}
): Promise<OperationResult> {
  const op = OPERATIONS_BY_ID.get(operationId);
  if (!op) {
    return { ok: false, error: { code: ERROR_CODES.UNKNOWN_OPERATION, message: `no such operation: '${operationId}'` } };
  }
  return executeOperation(op, rawInput, ctx);
}
