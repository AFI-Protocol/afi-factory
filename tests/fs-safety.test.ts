import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  invokeOperation,
  canonicalWorkspaceRoot,
  resolveWriteTarget,
  OperationFailure,
} from '../src/index.js';

/**
 * Filesystem-safety proofs (Section 14.3). Every write is bounded to the
 * approved workspace root; containment is decided on CANONICAL paths (realpath
 * of every existing ancestor), never a string prefix. All escapes fail closed.
 */

function freshRoot(): string {
  return mkdtempSync(join(tmpdir(), 'afi-ws-'));
}
function freshOutside(): string {
  return mkdtempSync(join(tmpdir(), 'afi-out-'));
}

/** Asserts a synchronous call throws OperationFailure with the given code. */
function expectFailureCode(fn: () => unknown, code: string): void {
  try {
    fn();
    throw new Error('expected OperationFailure, but call succeeded');
  } catch (e) {
    expect(e, 'is OperationFailure').toBeInstanceOf(OperationFailure);
    expect((e as OperationFailure).code).toBe(code);
  }
}

describe('workspace root validation', () => {
  it('absent / empty / malformed roots fail closed', () => {
    expectFailureCode(() => canonicalWorkspaceRoot(undefined), 'workspace_required');
    expectFailureCode(() => canonicalWorkspaceRoot({ root: '' }), 'workspace_required');
    expectFailureCode(() => canonicalWorkspaceRoot({ root: join(tmpdir(), 'afi-nope-' + Math.random().toString(36).slice(2)) }), 'workspace_required');
  });

  it('a file (not a directory) as root fails closed', () => {
    const root = freshRoot();
    const filePath = join(root, 'a-file');
    writeFileSync(filePath, 'x');
    expectFailureCode(() => canonicalWorkspaceRoot({ root: filePath }), 'workspace_required');
  });

  it('a valid directory root canonicalizes', () => {
    const root = freshRoot();
    expect(canonicalWorkspaceRoot({ root })).toBeTypeOf('string');
  });
});

describe('write-target resolution', () => {
  it('rejects ../ traversal', () => {
    const root = canonicalWorkspaceRoot({ root: freshRoot() });
    expectFailureCode(() => resolveWriteTarget(root, '../escape.json', false), 'path_escape');
    expectFailureCode(() => resolveWriteTarget(root, 'a/b/../../../escape.json', false), 'path_escape');
  });

  it('rejects absolute paths outside the root', () => {
    const root = canonicalWorkspaceRoot({ root: freshRoot() });
    const outside = join(freshOutside(), 'x.json');
    expectFailureCode(() => resolveWriteTarget(root, outside, false), 'path_escape');
  });

  it('rejects a pre-existing symlink target that points outside', () => {
    const root = canonicalWorkspaceRoot({ root: freshRoot() });
    const outsideFile = join(freshOutside(), 'secret.json');
    writeFileSync(outsideFile, '{}');
    const link = join(root, 'link.json');
    symlinkSync(outsideFile, link);
    expectFailureCode(() => resolveWriteTarget(root, 'link.json', true), 'path_escape');
  });

  it('rejects a write through a symlinked parent directory', () => {
    const root = canonicalWorkspaceRoot({ root: freshRoot() });
    const outsideDir = freshOutside();
    symlinkSync(outsideDir, join(root, 'sub'), 'dir');
    expectFailureCode(() => resolveWriteTarget(root, 'sub/x.json', false), 'path_escape');
  });

  it('rejects a DANGLING symlink whose (not-yet-existing) target is outside the root', () => {
    // Regression: existsSync() returns false for a dangling symlink, so the
    // symlink check must use lstat — otherwise writeFileSync follows the link
    // and creates a file OUTSIDE the workspace.
    const root = canonicalWorkspaceRoot({ root: freshRoot() });
    const outsideTarget = join(freshOutside(), 'pwned.json'); // does NOT exist yet
    symlinkSync(outsideTarget, join(root, 'link.json'));
    expectFailureCode(() => resolveWriteTarget(root, 'link.json', false), 'path_escape');
    expect(existsSync(outsideTarget), 'nothing was written outside the root').toBe(false);
  });

  it('rejects overwrite without explicit permission, allows it with permission', () => {
    const root = canonicalWorkspaceRoot({ root: freshRoot() });
    writeFileSync(join(root, 'exists.json'), '{}');
    expectFailureCode(() => resolveWriteTarget(root, 'exists.json', false), 'overwrite_denied');
    // With overwrite permitted, resolution succeeds and stays inside the root.
    const resolved = resolveWriteTarget(root, 'exists.json', true);
    expect(resolved.startsWith(root)).toBe(true);
  });

  it('accepts a fresh in-root relative path', () => {
    const root = canonicalWorkspaceRoot({ root: freshRoot() });
    const resolved = resolveWriteTarget(root, 'nested/dir/out.json', false);
    expect(resolved.startsWith(root)).toBe(true);
  });
});

describe('operation-level filesystem boundary (plugin.scaffold / artifact.package)', () => {
  it('scaffold writes inside the workspace and nowhere else', async () => {
    const root = freshRoot();
    const res = await invokeOperation(
      'factory.plugin.scaffold',
      { pluginId: 'demo-technical', category: 'technical', dir: 'plugins' },
      { workspace: { root } }
    );
    expect(res.ok).toBe(true);
    expect((res.output as any).written).toEqual(['plugins/demo-technical.plugin.json', 'plugins/demo-technical.contract.ts']);
    expect(existsSync(join(root, 'plugins', 'demo-technical.plugin.json'))).toBe(true);
  });

  it('scaffold ../ traversal fails closed and writes nothing', async () => {
    const root = freshRoot();
    const res = await invokeOperation(
      'factory.plugin.scaffold',
      { pluginId: 'evil', category: 'technical', dir: '../outside' },
      { workspace: { root } }
    );
    expect(res.ok).toBe(false);
    expect(res.error!.code).toBe('path_escape');
    expect(readdirSync(root)).toEqual([]);
  });

  it('scaffold overwrite without permission fails closed', async () => {
    const root = freshRoot();
    const args = { pluginId: 'dup', category: 'technical' as const, dir: '.' };
    const first = await invokeOperation('factory.plugin.scaffold', args, { workspace: { root } });
    expect(first.ok).toBe(true);
    const second = await invokeOperation('factory.plugin.scaffold', args, { workspace: { root } });
    expect(second.ok).toBe(false);
    expect(second.error!.code).toBe('overwrite_denied');
    const third = await invokeOperation('factory.plugin.scaffold', { ...args, overwrite: true }, { workspace: { root } });
    expect(third.ok).toBe(true);
  });

  it('scaffold through a pre-placed dangling symlink fails closed and writes nothing outside', async () => {
    const root = freshRoot();
    const outsideTarget = join(freshOutside(), 'evil.plugin.json'); // dangling target
    symlinkSync(outsideTarget, join(root, 'evil.plugin.json'));
    const res = await invokeOperation(
      'factory.plugin.scaffold',
      { pluginId: 'evil', category: 'technical', dir: '.' },
      { workspace: { root } }
    );
    expect(res.ok).toBe(false);
    expect(res.error!.code).toBe('path_escape');
    expect(existsSync(outsideTarget), 'nothing escaped the workspace').toBe(false);
  });

  it('scaffold with an unknown category fails closed with unknown_category', async () => {
    const root = freshRoot();
    const res = await invokeOperation(
      'factory.plugin.scaffold',
      { pluginId: 'x', category: 'astrology' },
      { workspace: { root } }
    );
    expect(res.ok).toBe(false);
    // enum on inputSchema catches it first as invalid_input — either is a fail-closed reject.
    expect(['invalid_input', 'unknown_category']).toContain(res.error!.code);
    expect(readdirSync(root)).toEqual([]);
  });
});
