/**
 * Deterministic capability catalog — a PROJECTION over the operation registry.
 * Contains no timestamps, no absolute/machine-specific paths, no usernames, no
 * environment-derived values, and no hand-written claims: every field is copied
 * from an OperationDef. Operations are emitted in a stable id-sorted order, so
 * equivalent registries produce a byte-identical catalog and the same hash.
 */
import { sha256Hex, canonicalize } from '../canonical-json.js';
import { OPERATION_ERROR_SCHEMA } from '../operations/errors.js';
import type { Determinism, FsPolicy, Mutability, OperationDef } from '../operations/types.js';

export const CATALOG_VERSION = '1';

export interface CatalogEntry {
  operationId: string;
  operationVersion: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  mutation: Mutability;
  determinism: Determinism;
  fsPolicy: FsPolicy;
  errorSchema: Record<string, unknown>;
}

export interface CapabilityCatalog {
  catalogVersion: string;
  operations: CatalogEntry[];
}

function byId(a: OperationDef, b: OperationDef): number {
  return a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0;
}

/** Builds the deterministic capability catalog from the operation registry. */
export function buildCapabilityCatalog(ops: readonly OperationDef[]): CapabilityCatalog {
  const operations: CatalogEntry[] = [...ops].sort(byId).map((op) => ({
    operationId: op.operationId,
    operationVersion: op.operationVersion,
    name: op.name,
    description: op.description,
    inputSchema: op.inputSchema,
    outputSchema: op.outputSchema,
    mutation: op.mutation,
    determinism: op.determinism,
    fsPolicy: op.fsPolicy,
    errorSchema: OPERATION_ERROR_SCHEMA,
  }));
  return { catalogVersion: CATALOG_VERSION, operations };
}

/** Stable canonical hash of a catalog (canonical-json serialization + SHA-256). */
export function catalogHash(catalog: CapabilityCatalog): string {
  return sha256Hex(canonicalize(catalog));
}
