/**
 * Normalized error contract for the operation layer. Domain failures throw an
 * `OperationFailure` carrying a stable `code` (and optional JSON-pointer
 * issues); the invoker converts it into the `OperationError` envelope. This
 * keeps every projection (SDK, CLI, MCP) reporting the same machine codes.
 */
import type { ValidationIssue } from '../schemas.js';

/** Stable machine-readable error codes. */
export const ERROR_CODES = {
  /** Input failed the operation's declared input schema. */
  INVALID_INPUT: 'invalid_input',
  /** Handler output failed its declared output schema (implementation bug guard). */
  INVALID_OUTPUT: 'invalid_output',
  /** No operation is registered under the requested id. */
  UNKNOWN_OPERATION: 'unknown_operation',
  /** A supplied governed artifact failed schema/semantic validation (refused). */
  VALIDATION_FAILED: 'validation_failed',
  /** A requested analysis-plugin category is not one Factory recognizes. */
  UNKNOWN_CATEGORY: 'unknown_category',
  /** A requested bundled official composition id does not exist. */
  UNKNOWN_OFFICIAL: 'unknown_official',
  /** A mutating operation was invoked without a workspace. */
  WORKSPACE_REQUIRED: 'workspace_required',
  /** A resolved path escaped the approved workspace root (traversal/symlink/absolute). */
  PATH_ESCAPE: 'path_escape',
  /** A write target already exists and overwrite was not explicitly permitted. */
  OVERWRITE_DENIED: 'overwrite_denied',
  /** A required input artifact/path was absent. */
  NOT_FOUND: 'not_found',
  /** A filesystem read/write failed. */
  IO_ERROR: 'io_error',
  /** Unexpected internal error (never a domain condition). */
  INTERNAL_ERROR: 'internal_error',
} as const;

export type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** A domain failure raised by a handler or the security layer. */
export class OperationFailure extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly issues?: ValidationIssue[]
  ) {
    super(message);
    this.name = 'OperationFailure';
  }
}

/** Shared JSON Schema for the OperationError envelope (published in the catalog). */
export const OPERATION_ERROR_SCHEMA: Record<string, unknown> = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  title: 'OperationError',
  type: 'object',
  required: ['code', 'message'],
  additionalProperties: false,
  properties: {
    code: {
      type: 'string',
      enum: Object.values(ERROR_CODES),
      description: 'Stable machine-readable error code.',
    },
    message: { type: 'string' },
    issues: {
      type: 'array',
      description: 'JSON-pointer-carrying issues (schema/semantic violations).',
      items: {
        type: 'object',
        required: ['pointer', 'message'],
        additionalProperties: true,
        properties: {
          pointer: { type: 'string', description: "JSON pointer into the offending document ('' = root)." },
          message: { type: 'string' },
          keyword: { type: 'string' },
        },
      },
    },
  },
};
