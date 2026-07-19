/**
 * The Factory operation layer: the typed operation registry, the invoker, the
 * normalized error contract, and the workspace security boundary. Every
 * agent-operable capability lives here as an implementation-backed OperationDef.
 */
export type {
  OperationDef,
  OperationResult,
  OperationError,
  OperationContext,
  Workspace,
  Mutability,
  Determinism,
  FsPolicy,
} from './types.js';
export { ERROR_CODES, OperationFailure, OPERATION_ERROR_SCHEMA, type ErrorCode } from './errors.js';
export { OPERATIONS, getOperation, listOperationIds, invokeOperation } from './registry.js';
export { DOMAIN_OPERATIONS, ANALYSIS_CATEGORIES } from './handlers.js';
export {
  canonicalWorkspaceRoot,
  resolveWriteTarget,
  resolveReadTarget,
  writeWorkspaceJson,
  writeWorkspaceText,
  readWorkspaceJson,
} from './workspace.js';
export {
  listBundledOfficialDirs,
  loadBundledOfficial,
  loadAllBundledOfficial,
  type BundledOfficialArtifacts,
} from './assets.js';
