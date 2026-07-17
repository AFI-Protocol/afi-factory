/**
 * Typed operation contracts for the Factory agent capability layer.
 *
 * ONE implementation-backed source of truth: every advertised capability is an
 * `OperationDef` here, wrapping a REAL Factory handler. The SDK, CLI,
 * capability catalog, generic tool definitions, and MCP adapter are all
 * projections over the same registry — a capability cannot exist without a
 * handler, an input schema, an output schema, and a declared fs/security
 * policy. Changing or removing an operation changes every projection.
 *
 * This layer is implementation metadata. It is NOT a protocol authority and NOT
 * the executor: it authors and validates afi.pipeline.v1 contract-family
 * artifacts against the vendored governed schema closure; nothing here runs a
 * pipeline, loads plugin code, persists evidence, or contacts a network.
 */
import type { ValidationIssue } from '../schemas.js';

/** Whether an operation may write to the caller-supplied workspace. */
export type Mutability = 'read-only' | 'mutating';

/**
 * Whether an operation's output is a pure function of its input + Factory's own
 * vendored assets (deterministic) or depends on the caller's workspace contents
 * at invocation time (environment-dependent).
 */
export type Determinism = 'deterministic' | 'environment-dependent';

/**
 * Declared filesystem policy. Reads, when true, are bounded to EITHER Factory's
 * own vendored package assets (fixed, caller-cannot-redirect) or the explicit
 * workspace root. Writes, when true, are ALWAYS bounded to the explicit
 * workspace root and fail closed on any escape.
 */
export interface FsPolicy {
  /** May read the caller-supplied workspace (bounded to its canonical root). */
  readsWorkspace: boolean;
  /** May write into the caller-supplied workspace (bounded to its canonical root). */
  writesWorkspace: boolean;
  /** May read Factory's own vendored package assets (fixed paths, not caller-controlled). */
  readsBundledAssets: boolean;
  /** Human-facing note on exactly what is read/written. */
  notes: string;
}

/** Normalized, machine-readable operation error. */
export interface OperationError {
  /** Stable machine code — see errors.ts ERROR_CODES. */
  code: string;
  message: string;
  /** JSON-pointer-carrying issues (schema violations, path pointers). */
  issues?: ValidationIssue[];
}

/** The result envelope every invocation resolves to (never throws to callers). */
export interface OperationResult<O = unknown> {
  ok: boolean;
  output?: O;
  error?: OperationError;
}

/**
 * Explicit, caller-supplied workspace. Its `root` is canonicalized (realpath)
 * and every write is bounded to it. Overwrites require `allowOverwrite`.
 */
export interface Workspace {
  root: string;
  allowOverwrite?: boolean;
}

/** Invocation context. Mutating operations REQUIRE `workspace`. */
export interface OperationContext {
  workspace?: Workspace;
}

/**
 * The single definition of one Factory capability. `handler` is the real
 * implementation; input is schema-validated before it runs and output is
 * schema-validated after (a handler that returns a shape violating its declared
 * outputSchema is a bug, surfaced as `invalid_output`, never returned as ok).
 */
export interface OperationDef<I = unknown, O = unknown> {
  operationId: string;
  operationVersion: string;
  name: string;
  description: string;
  /** JSON Schema (draft-07) for the operation's input envelope. */
  inputSchema: Record<string, unknown>;
  /** JSON Schema (draft-07) for the operation's output. */
  outputSchema: Record<string, unknown>;
  mutation: Mutability;
  determinism: Determinism;
  fsPolicy: FsPolicy;
  handler: (input: I, ctx: OperationContext) => O | Promise<O>;
}
