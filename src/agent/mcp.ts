/**
 * MCP-compatible stdio adapter — a thin TRANSPORT over the operation registry.
 *
 * Speaks the Model Context Protocol wire format directly: newline-delimited
 * JSON-RPC 2.0 messages over a caller-supplied input/output stream pair (stdio
 * by default). It implements `initialize`, `tools/list`, `tools/call`, and
 * `ping`; unknown methods return JSON-RPC "method not found". Tool calls are
 * dispatched through `invokeOperation`, so schema validation, the workspace
 * boundary, and the normalized error contract are enforced by the SAME handlers
 * the SDK and CLI use — this file contains NO operation logic.
 *
 * By construction it opens NO network listener, executes NO shell command,
 * performs NO dynamic import, and grants NO filesystem access beyond what a
 * mutating operation's declared workspace boundary already allows.
 */
import { invokeOperation, OPERATIONS } from '../operations/registry.js';
import type { Workspace } from '../operations/types.js';
import { buildToolDefinitions } from './tools.js';

export const MCP_PROTOCOL_VERSION = '2024-11-05';

export interface McpServerOptions {
  /** Line-delimited JSON-RPC input (e.g. process.stdin). */
  input: NodeJS.ReadableStream;
  /** Line-delimited JSON-RPC output (e.g. process.stdout). */
  output: NodeJS.WritableStream;
  /** Workspace passed to mutating tool handlers (absent = mutating tools fail closed). */
  workspace?: Workspace;
  serverName?: string;
  serverVersion?: string;
  /** Invoked once when the input stream ends (clean shutdown). */
  onClose?: () => void;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: unknown;
}

interface McpServerHandle {
  /** Detaches stream listeners (does not close the underlying streams). */
  close(): void;
}

/** Starts the MCP stdio server. Returns a handle whose close() detaches listeners. */
export function serveMcpStdio(opts: McpServerOptions): McpServerHandle {
  const serverName = opts.serverName ?? 'afi-factory';
  const serverVersion = opts.serverVersion ?? '1.0.0';
  let buffer = '';
  let chain: Promise<void> = Promise.resolve();
  let outputBroken = false;

  // A downstream close (EPIPE) is a shutdown signal, not a crash: stop writing.
  const onOutputError = (err: NodeJS.ErrnoException): void => {
    if (err && err.code === 'EPIPE') {
      outputBroken = true;
      opts.onClose?.();
      return;
    }
    throw err;
  };
  opts.output.on('error', onOutputError);

  const send = (msg: JsonRpcMessage): void => {
    if (outputBroken) return;
    opts.output.write(JSON.stringify(msg) + '\n');
  };
  const reply = (id: string | number, result: unknown): void => send({ jsonrpc: '2.0', id, result });
  const replyError = (id: string | number | null, code: number, message: string): void =>
    send({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });

  async function handle(msg: JsonRpcMessage): Promise<void> {
    if (msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      if (msg.id !== undefined && msg.id !== null) replyError(msg.id, -32600, 'Invalid Request');
      return;
    }
    const isNotification = msg.id === undefined || msg.id === null;
    const id = (msg.id ?? null) as string | number | null;

    switch (msg.method) {
      case 'initialize': {
        const requested = (msg.params as { protocolVersion?: string } | undefined)?.protocolVersion;
        if (!isNotification) {
          reply(id as string | number, {
            protocolVersion: requested ?? MCP_PROTOCOL_VERSION,
            capabilities: { tools: {} },
            serverInfo: { name: serverName, version: serverVersion },
          });
        }
        return;
      }
      case 'notifications/initialized':
      case 'initialized':
        return; // notification; no response
      case 'ping':
        if (!isNotification) reply(id as string | number, {});
        return;
      case 'tools/list': {
        if (isNotification) return;
        reply(id as string | number, { tools: buildToolDefinitions(OPERATIONS) });
        return;
      }
      case 'tools/call': {
        if (isNotification) return;
        const params = (msg.params ?? {}) as { name?: unknown; arguments?: unknown };
        if (typeof params.name !== 'string') {
          replyError(id, -32602, 'tools/call requires a string "name"');
          return;
        }
        const result = await invokeOperation(params.name, params.arguments ?? {}, {
          workspace: opts.workspace,
        });
        if (result.ok) {
          reply(id as string | number, {
            content: [{ type: 'text', text: JSON.stringify(result.output, null, 2) }],
            structuredContent: result.output,
            isError: false,
          });
        } else {
          reply(id as string | number, {
            content: [{ type: 'text', text: JSON.stringify(result.error, null, 2) }],
            structuredContent: result.error,
            isError: true,
          });
        }
        return;
      }
      default:
        if (!isNotification) replyError(id, -32601, `Method not found: ${msg.method}`);
        return;
    }
  }

  function dispatchLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: JsonRpcMessage;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      replyError(null, -32700, 'Parse error');
      return;
    }
    // Serialize handling to preserve request/response ordering.
    chain = chain.then(() => handle(msg)).catch((e) => {
      replyError((msg.id ?? null) as string | number | null, -32603, `Internal error: ${(e as Error).message}`);
    });
  }

  const onData = (chunk: Buffer | string): void => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      dispatchLine(line);
    }
  };

  const onEnd = (): void => {
    if (buffer.trim()) {
      dispatchLine(buffer);
      buffer = '';
    }
    chain = chain.then(() => opts.onClose?.());
  };

  opts.input.on('data', onData);
  opts.input.once('end', onEnd);
  opts.input.once('close', onEnd);

  return {
    close(): void {
      opts.input.off('data', onData);
      opts.input.off('end', onEnd);
      opts.input.off('close', onEnd);
      opts.output.off('error', onOutputError);
    },
  };
}
