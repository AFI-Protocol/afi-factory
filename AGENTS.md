# AGENTS.md — afi-factory

Honest orientation for agents working in this repo.

## What this repo is

The **pipeline authoring system** for AFI's analyst-configurable pipelines
program (SLOT-FCP-FACTORY under
`afi-governance/decisions/factory-configurable-pipelines-v1.md`). It is a
**replaceable implementation** (D-FCP-4): template authoring/instantiation,
manifest validation, canonical hashing, graph inspection, plugin scaffolding.
It is NOT a protocol authority, NOT the executor, and holds no canonical
contracts — those live in afi-config.

## Layout

- `src/governed-schema/` — **vendored, byte-pinned** copies of the afi-config
  contracts this repo consumes (pinned commit + per-file sha256 in
  `MANIFEST.json`). NEVER hand-edit; re-vendor only from an owner-approved
  afi-config commit and update `MANIFEST.json` + run `npm run codegen`.
- `src/generated/` — TypeScript types **generated** from the vendored schemas
  (`npm run codegen`). Never hand-edit; freshness is test-enforced.
- `src/` — the library: `canonical-json.ts` (hashing), `schemas.ts` (strict
  AJV), `graph.ts` (graph semantics + plugin binding), `template.ts`
  (instantiation), `analyst-config.ts` (cross-artifact checks), `inspect.ts`,
  `scaffold.ts`, `loader.ts`, `authoring.ts` (shared skeleton/slot helpers),
  `cli/index.ts` (commander CLI, wired as the `afi-factory` bin).
- `src/operations/` — the **agent capability layer**: one typed operation
  registry (`handlers.ts` + `registry.ts`) wrapping the real library functions,
  a normalized error contract (`errors.ts`), and the fail-closed workspace
  boundary (`workspace.ts`). Every advertised capability has a real handler,
  validated input/output schemas, and a declared fs/security policy. Do NOT add
  a capability without a handler, and never hand-maintain a static catalog file.
- `src/agent/` — projections over the registry: the deterministic capability
  catalog (`catalog.ts`), the generic framework-neutral tool definitions
  (`tools.ts`), and the MCP-compatible stdio adapter (`mcp.ts`, transport only).
- `official/froggy-trend-pullback/` — the official composition artifacts:
  BYTE-IDENTICAL copies of the canonical afi-config registry records (the
  registered v1.3.0 pipeline manifest, the canonical analyst-config, the seven
  bound plugin manifests) plus `hashes.json` (committed canonical hashes that
  downstream waves pin — re-vendor only from an owner-approved afi-config
  commit, together, and only when the change is authorized).
- `fixtures/conformance/` — the eight configurability proof graphs
  (non-production).
- `tests/` — vitest: drift guard, hashing KATs, semantic validation mirror,
  template instantiation, official artifacts, conformance fixtures, CLI
  behaviour, codegen freshness, no-dangling-references.

## Commands

```sh
npm ci
npm run typecheck   # tsc --noEmit over src + tests
npm run build       # tsc -> dist + copies governed-schema JSON into dist
npm test            # builds first (pretest), then vitest run
npm run codegen     # regenerate src/generated from src/governed-schema

# agent capability layer
afi-factory capabilities --json     # deterministic capability catalog
afi-factory capabilities --tools    # generic (framework-neutral) tool definitions
afi-factory capabilities --hash     # stable catalog hash
afi-factory agent serve --transport stdio --workspace <dir>   # MCP stdio adapter
```

## Rules

- **Conform to the vendored contracts exactly.** If a contract must change,
  that is an afi-config change under governance — not a local edit.
- **Hashing is KAT-pinned.** Any change to `src/canonical-json.ts` must keep
  all six vendored KAT vectors passing byte-exactly.
- **Fail closed.** No demo/mock/synthetic fallbacks anywhere (D-FCP-8); an
  unknown plugin identity is an error; hashing refuses invalid artifacts.
- **hashes.json is a pin.** Downstream waves rely on the committed
  manifestHash / analystConfigHash / pluginSetHash values.
- **No executor code.** Anything that runs a pipeline belongs to afi-reactor
  (SLOT-FCP-REACTOR), not here.
- **One source of truth for capabilities.** The SDK, CLI, catalog, tool
  definitions, and MCP adapter all project over `src/operations/`. Never
  duplicate a capability description or schema, and never contact live AFI
  services from the agent layer.
- **Not the API Atlas.** The Factory capability catalog is authoring-side
  implementation metadata, not a network-wide service map; that is reserved for
  the future API Atlas and is out of scope here.
