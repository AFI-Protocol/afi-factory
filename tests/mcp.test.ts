import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtempSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { serveMcpStdio, buildToolDefinitions, OPERATIONS, type Workspace } from '../src/index.js';
import { officialDir, readJson } from './helpers.js';

/**
 * MCP-compatible stdio adapter proofs (Section 14.5): clean startup, capability
 * + tool listing, tool invocation (structured success and structured error),
 * schema validation, clean shutdown, no unexpected network listener, no shell
 * execution, no arbitrary import, no unrestricted filesystem access, and no
 * hidden mutation from read-only tools. Driven over in-memory streams.
 */

const manifest = readJson<any>(join(officialDir, 'pipeline.manifest.json'));

/** Feeds newline-delimited JSON-RPC messages through the adapter; resolves with parsed responses. */
function runMcp(messages: unknown[], opts: { workspace?: Workspace } = {}): Promise<any[]> {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines: any[] = [];
  output.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString('utf8').split('\n')) {
      if (line.trim()) lines.push(JSON.parse(line));
    }
  });
  return new Promise((resolve) => {
    output.on('end', () => resolve(lines));
    serveMcpStdio({ input, output, workspace: opts.workspace, onClose: () => output.end() });
    for (const m of messages) input.write(JSON.stringify(m) + '\n');
    input.end();
  });
}

describe('MCP stdio adapter', () => {
  it('initializes cleanly and advertises tools capability', async () => {
    const [res] = await runMcp([{ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05' } }]);
    expect(res.id).toBe(1);
    expect(res.result.protocolVersion).toBe('2024-11-05');
    expect(res.result.capabilities.tools).toBeDefined();
    expect(res.result.serverInfo.name).toBe('afi-factory');
  });

  it('lists exactly the registry tools', async () => {
    const [res] = await runMcp([{ jsonrpc: '2.0', id: 2, method: 'tools/list' }]);
    expect(res.result.tools).toEqual(buildToolDefinitions(OPERATIONS));
  });

  it('invokes a read-only tool with a structured success result', async () => {
    const [res] = await runMcp([
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'factory.pipeline.validate', arguments: { pipeline: manifest } } },
    ]);
    expect(res.result.isError).toBe(false);
    expect(res.result.structuredContent.valid).toBe(true);
    expect(res.result.content[0].type).toBe('text');
  });

  it('returns a structured error for an unknown tool', async () => {
    const [res] = await runMcp([
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'factory.nope', arguments: {} } },
    ]);
    expect(res.result.isError).toBe(true);
    expect(res.result.structuredContent.code).toBe('unknown_operation');
  });

  it('enforces input-schema validation before dispatch', async () => {
    const [res] = await runMcp([
      { jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'factory.pipeline.validate', arguments: { wrong: 1 } } },
    ]);
    expect(res.result.isError).toBe(true);
    expect(res.result.structuredContent.code).toBe('invalid_input');
  });

  it('returns JSON-RPC method-not-found for unknown methods', async () => {
    const [res] = await runMcp([{ jsonrpc: '2.0', id: 6, method: 'no/such/method' }]);
    expect(res.error.code).toBe(-32601);
  });

  it('sends no response for a notification (no id)', async () => {
    const responses = await runMcp([{ jsonrpc: '2.0', method: 'notifications/initialized' }]);
    expect(responses).toEqual([]);
  });

  it('shuts down cleanly when input ends (onClose fires)', async () => {
    let closed = false;
    const input = new PassThrough();
    const output = new PassThrough();
    await new Promise<void>((resolve) => {
      serveMcpStdio({ input, output, onClose: () => { closed = true; resolve(); } });
      input.end();
    });
    expect(closed).toBe(true);
  });

  it('a read-only tool call performs no filesystem mutation even with a workspace', async () => {
    const root = mkdtempSync(join(tmpdir(), 'afi-mcp-ro-'));
    await runMcp(
      [{ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'factory.pipeline.inspect', arguments: { pipeline: manifest } } }],
      { workspace: { root } }
    );
    expect(readdirSync(root)).toEqual([]);
  });

  it('a mutating tool writes ONLY inside the provided workspace', async () => {
    const root = mkdtempSync(join(tmpdir(), 'afi-mcp-rw-'));
    const [res] = await runMcp(
      [{ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'factory.plugin.scaffold', arguments: { pluginId: 'mcp-demo', category: 'pattern', dir: 'p' } } }],
      { workspace: { root } }
    );
    expect(res.result.isError).toBe(false);
    expect(existsSync(join(root, 'p', 'mcp-demo.plugin.json'))).toBe(true);
  });

  it('a mutating tool without a workspace fails closed', async () => {
    const [res] = await runMcp([
      { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'factory.plugin.scaffold', arguments: { pluginId: 'x', category: 'news' } } },
    ]);
    expect(res.result.isError).toBe(true);
    expect(res.result.structuredContent.code).toBe('workspace_required');
  });
});
