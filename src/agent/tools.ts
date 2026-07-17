/**
 * Generic, framework-neutral agent tool definitions — a PROJECTION over the
 * operation registry. Each tool is `{ name, description, inputSchema }` with the
 * operationId as the name and the operation's own JSON Schema as inputSchema.
 * No framework-specific branding or assumptions (MCP / function-calling / other
 * tool-using systems each adapt these). Emitted in stable id-sorted order; one
 * tool per operation, no more, no fewer.
 */
import type { OperationDef } from '../operations/types.js';

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** Builds the neutral tool definitions from the operation registry. */
export function buildToolDefinitions(ops: readonly OperationDef[]): ToolDefinition[] {
  return [...ops]
    .sort((a, b) => (a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0))
    .map((op) => ({
      name: op.operationId,
      description: op.description,
      inputSchema: op.inputSchema,
    }));
}
