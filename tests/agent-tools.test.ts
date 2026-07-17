import { describe, it, expect } from 'vitest';
import { OPERATIONS, getOperation, buildToolDefinitions, createFragmentAjv } from '../src/index.js';

/**
 * Generic (framework-neutral) tool-definition proofs (Section 14.4): schemas
 * validate, every tool maps 1:1 to an operation handler, deterministic ordering,
 * stable serialization, and no framework-specific assumptions in the neutral
 * definitions.
 */

describe('generic agent tool definitions', () => {
  it('every emitted tool inputSchema is a compilable JSON Schema', () => {
    const ajv = createFragmentAjv();
    for (const tool of buildToolDefinitions(OPERATIONS)) {
      expect(() => ajv.compile(tool.inputSchema), `${tool.name} schema compiles`).not.toThrow();
    }
  });

  it('maps 1:1 onto operations — no missing, no extra', () => {
    const tools = buildToolDefinitions(OPERATIONS);
    expect(tools.length).toBe(OPERATIONS.length);
    const toolNames = tools.map((t) => t.name).sort();
    const opIds = OPERATIONS.map((o) => o.operationId).sort();
    expect(toolNames).toEqual(opIds);
    for (const tool of tools) {
      const op = getOperation(tool.name);
      expect(op, `tool ${tool.name} has a backing operation`).toBeDefined();
      expect(typeof op!.handler).toBe('function');
      expect(tool.inputSchema).toEqual(op!.inputSchema);
      expect(tool.description).toBe(op!.description);
    }
  });

  it('is emitted in a deterministic, stable, id-sorted order', () => {
    const a = buildToolDefinitions(OPERATIONS);
    const b = buildToolDefinitions(OPERATIONS);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    const names = a.map((t) => t.name);
    expect(names).toEqual([...names].sort());
  });

  it('uses only neutral keys (name/description/inputSchema) — no framework branding', () => {
    for (const tool of buildToolDefinitions(OPERATIONS)) {
      expect(Object.keys(tool).sort()).toEqual(['description', 'inputSchema', 'name']);
    }
    const text = JSON.stringify(buildToolDefinitions(OPERATIONS)).toLowerCase();
    for (const brand of ['mcp', 'openai', 'claude', 'anthropic', 'function_call', 'gpt']) {
      expect(text, `neutral defs must not mention '${brand}'`).not.toContain(brand);
    }
  });
});
