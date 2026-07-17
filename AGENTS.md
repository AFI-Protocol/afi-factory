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
  `scaffold.ts`, `loader.ts`, `cli/index.ts` (commander CLI, wired as the
  `afi-factory` bin).
- `templates/official/froggy-trend-pullback/` — the official template, its
  instantiated canonical manifest, the seven official plugin manifests, the
  official analyst-config, and `hashes.json` (committed canonical hashes that
  downstream waves pin — regenerate only together with the artifacts and only
  when the change is authorized).
- `fixtures/conformance/` — the eight configurability proof graphs
  (non-production).
- `tests/` — vitest: drift guard, hashing KATs, semantic validation mirror,
  template instantiation, official artifacts, conformance fixtures, CLI
  behaviour, codegen freshness, no-dangling-references.
- `schemas/index.ts`, `template_registry.ts` — **TEMPORARY SEQUENCING SHIMS**
  for afi-reactor main. Do not use, do not extend; removal is scheduled under
  SLOT-FCP-CLEANUP. Their package.json export entries must stay until then.

## Commands

```sh
npm ci
npm run typecheck   # tsc --noEmit over src + tests + shims
npm run build       # tsc -> dist + copies governed-schema JSON into dist
npm test            # builds first (pretest), then vitest run
npm run codegen     # regenerate src/generated from src/governed-schema
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
