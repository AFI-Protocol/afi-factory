/**
 * Agent projections over the Factory operation registry: the deterministic
 * capability catalog, the generic (framework-neutral) tool definitions, and the
 * MCP-compatible stdio adapter. All three are views of the SAME operations —
 * none is the architectural authority.
 */
export {
  buildCapabilityCatalog,
  catalogHash,
  CATALOG_VERSION,
  type CapabilityCatalog,
  type CatalogEntry,
} from './catalog.js';
export { buildToolDefinitions, type ToolDefinition } from './tools.js';
export { serveMcpStdio, MCP_PROTOCOL_VERSION, type McpServerOptions } from './mcp.js';
