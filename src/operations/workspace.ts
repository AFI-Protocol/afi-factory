/**
 * Fail-closed filesystem boundary for mutating operations.
 *
 * Every write is bounded to an explicit, caller-supplied workspace root. Path
 * traversal, absolute-path escape, symlink escape, symlinked-parent escape,
 * output paths resolving outside the root, unauthorized overwrite, and
 * malformed/absent roots ALL fail closed. Containment is decided on CANONICAL
 * paths (realpath of every existing ancestor), never on string prefixes alone.
 *
 * This module performs NO dynamic import, NO command execution, and NO network
 * I/O — it only resolves and writes/reads plain files inside a verified root.
 */
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { ERROR_CODES, OperationFailure } from './errors.js';
import type { Workspace } from './types.js';

/** True iff `target` is `root` itself or lexically contained within it. */
function isContained(root: string, target: string): boolean {
  if (target === root) return true;
  const rel = relative(root, target);
  return rel !== '' && !rel.startsWith('..' + sep) && rel !== '..' && !isAbsolute(rel);
}

function assertContained(root: string, target: string, what: string): void {
  if (!isContained(root, target)) {
    throw new OperationFailure(
      ERROR_CODES.PATH_ESCAPE,
      `${what} resolves outside the approved workspace root`,
      [{ pointer: '', message: `'${target}' is not within '${root}'` }]
    );
  }
}

/** Canonicalizes and validates the workspace root. Fails closed if missing/malformed. */
export function canonicalWorkspaceRoot(ws: Workspace | undefined): string {
  if (!ws || typeof ws.root !== 'string' || ws.root.trim() === '') {
    throw new OperationFailure(
      ERROR_CODES.WORKSPACE_REQUIRED,
      'a mutating operation requires an explicit workspace root'
    );
  }
  const abs = resolve(ws.root);
  if (!existsSync(abs)) {
    throw new OperationFailure(
      ERROR_CODES.WORKSPACE_REQUIRED,
      `workspace root does not exist: ${ws.root}`
    );
  }
  let real: string;
  try {
    real = realpathSync(abs);
  } catch (e) {
    throw new OperationFailure(
      ERROR_CODES.WORKSPACE_REQUIRED,
      `workspace root is not resolvable: ${(e as Error).message}`
    );
  }
  if (!statSync(real).isDirectory()) {
    throw new OperationFailure(
      ERROR_CODES.WORKSPACE_REQUIRED,
      `workspace root is not a directory: ${ws.root}`
    );
  }
  return real;
}

/** Realpath of the deepest existing ancestor of `target` (target itself if it exists). */
function deepestExistingReal(target: string): string {
  let cur = target;
  // Walk up until an existing path is found (root of the filesystem always exists).
  // eslint-disable-next-line no-constant-condition
  while (true) {
    if (existsSync(cur)) return realpathSync(cur);
    const parent = dirname(cur);
    if (parent === cur) return realpathSync(cur);
    cur = parent;
  }
}

/**
 * Resolves a caller-supplied relative path to a canonical absolute path proven
 * to stay inside `root`, suitable for WRITING. Rejects:
 *   - `../` traversal and absolute paths escaping the root;
 *   - any existing ancestor whose realpath lies outside the root (symlinked parent);
 *   - a pre-existing target that is a symlink pointing outside the root;
 *   - a pre-existing target when overwrite is not permitted.
 */
export function resolveWriteTarget(
  root: string,
  relPath: string,
  allowOverwrite: boolean
): string {
  if (typeof relPath !== 'string' || relPath.trim() === '') {
    throw new OperationFailure(ERROR_CODES.INVALID_INPUT, 'output path must be a non-empty string');
  }
  // Absolute inputs are only admissible if they already sit inside the root.
  const target = isAbsolute(relPath) ? resolve(relPath) : resolve(root, relPath);

  // (1) lexical containment — catches ../ traversal and absolute escapes cheaply.
  assertContained(root, target, 'output path');

  // (2) canonical ancestor containment — catches a symlinked parent pointing out.
  const realAncestor = deepestExistingReal(target);
  assertContained(root, realAncestor, 'output path (via an existing ancestor)');

  // (3) Classify the target itself with lstat — which, UNLIKE existsSync, does
  //     not follow symlinks and DOES observe a *dangling* symlink (one whose
  //     target does not yet exist). A symlink is never a legitimate write
  //     target: writing through it (even a dangling one, which writeFileSync
  //     would happily follow to create a file OUTSIDE the root) fails closed.
  let targetStat: ReturnType<typeof lstatSync> | undefined;
  try {
    targetStat = lstatSync(target);
  } catch {
    targetStat = undefined; // no filesystem entry at target at all -> fresh write
  }
  if (targetStat) {
    if (targetStat.isSymbolicLink()) {
      throw new OperationFailure(
        ERROR_CODES.PATH_ESCAPE,
        'output path is a symlink; refusing to write through it'
      );
    }
    // A real (non-symlink) entry exists: canonicalize and enforce overwrite policy.
    const realTarget = realpathSync(target);
    assertContained(root, realTarget, 'existing output path');
    if (!allowOverwrite) {
      throw new OperationFailure(
        ERROR_CODES.OVERWRITE_DENIED,
        `refusing to overwrite existing '${relPath}' without explicit permission`
      );
    }
  }
  return target;
}

/** Resolves a caller-supplied path proven to stay inside `root`, for READING. */
export function resolveReadTarget(root: string, relPath: string): string {
  if (typeof relPath !== 'string' || relPath.trim() === '') {
    throw new OperationFailure(ERROR_CODES.INVALID_INPUT, 'read path must be a non-empty string');
  }
  const target = isAbsolute(relPath) ? resolve(relPath) : resolve(root, relPath);
  assertContained(root, target, 'read path');
  if (!existsSync(target)) {
    throw new OperationFailure(ERROR_CODES.NOT_FOUND, `path does not exist in workspace: ${relPath}`);
  }
  const real = realpathSync(target);
  assertContained(root, real, 'read path (canonical)');
  return real;
}

/** Writes JSON to a workspace-bounded path (parent dirs created inside the root). */
export function writeWorkspaceJson(
  root: string,
  relPath: string,
  doc: unknown,
  allowOverwrite: boolean
): string {
  const target = resolveWriteTarget(root, relPath, allowOverwrite);
  ensureParentWithinRoot(root, target);
  try {
    writeFileSync(target, JSON.stringify(doc, null, 2) + '\n');
  } catch (e) {
    throw new OperationFailure(ERROR_CODES.IO_ERROR, `failed to write '${relPath}': ${(e as Error).message}`);
  }
  return relative(root, target);
}

/** Writes raw text to a workspace-bounded path. */
export function writeWorkspaceText(
  root: string,
  relPath: string,
  text: string,
  allowOverwrite: boolean
): string {
  const target = resolveWriteTarget(root, relPath, allowOverwrite);
  ensureParentWithinRoot(root, target);
  try {
    writeFileSync(target, text);
  } catch (e) {
    throw new OperationFailure(ERROR_CODES.IO_ERROR, `failed to write '${relPath}': ${(e as Error).message}`);
  }
  return relative(root, target);
}

/** Creates the parent directory of `target`, verifying it stays inside the root. */
function ensureParentWithinRoot(root: string, target: string): void {
  const parent = dirname(target);
  const realParentAncestor = deepestExistingReal(parent);
  assertContained(root, realParentAncestor, 'output directory');
  try {
    mkdirSync(parent, { recursive: true });
  } catch (e) {
    throw new OperationFailure(ERROR_CODES.IO_ERROR, `failed to create directory: ${(e as Error).message}`);
  }
  // Re-verify AFTER creation (the newly-materialized dir must still be inside).
  assertContained(root, realpathSync(parent), 'output directory (canonical)');
}

export { join as joinPath };

/** Reads and JSON-parses a workspace-bounded file. */
export function readWorkspaceJson(root: string, relPath: string): unknown {
  const target = resolveReadTarget(root, relPath);
  let raw: string;
  try {
    raw = readFileSync(target, 'utf-8');
  } catch (e) {
    throw new OperationFailure(ERROR_CODES.IO_ERROR, `failed to read '${relPath}': ${(e as Error).message}`);
  }
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new OperationFailure(ERROR_CODES.INVALID_INPUT, `invalid JSON in '${relPath}': ${(e as Error).message}`);
  }
}
