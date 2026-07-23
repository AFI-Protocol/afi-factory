# Plugin developer onboarding

Plugins are the reusable **analysis and scoring building blocks** a strategy
workflow draws on — so this is the most technical persona. You are declaring
(and separately implementing) one analysis plugin in the seven governed
categories: `technical`, `pattern`, `sentiment`, `news`, `aiMl`, `merge`,
`scorer`.

## 1. Scaffold the manifest + contract stub

```sh
afi-factory plugin scaffold --id my-sentiment --category sentiment --dir ./my-plugin
```

You get `my-sentiment.plugin.json` (a schema-valid `afi.analysis-plugin.v1`
skeleton) and `my-sentiment.contract.ts` (the implementation contract stub the
consuming runtime's build-time registry binds).

## 2. Declare honestly — every field is a contract

- `pluginId` + `pluginVersion` — the registry key pipelines bind. Bump
  `pluginVersion` whenever the declared contract changes;
  `implementationVersion` alone for contract-preserving code fixes (it feeds
  the composition's `pluginSetHash`).
- `deterministic` — `true` ONLY if output is a pure function of validated
  input + config (no I/O, no clock, no randomness). External-provider plugins
  MUST declare `false`.
- `capabilities` — requirement classes the operator environment must satisfy
  (`provider:<id>`, `secret:<ENV_NAME>`, `service:<id>`). Never secret values.
- `paramsSchema` — the single authority validating a binding node's `config`.
  Factory rejects any composition whose node config fails it.
- `permittedFailurePolicies` — whether nodes may declare `degrade`. Absent
  means abort-only.
- `multiInstance` — whether one graph may bind you on several nodes.
- `mayFeedScorer` — whether your output is admissible scorer input. Scorers
  declare `false` (a scorer never feeds another scorer).
- `inputSchemaRef`/`outputSchemaRef` — schema identifiers, **never filesystem
  paths**. There is deliberately no way to reference code from a manifest.

## 3. Validate

```sh
afi-factory pipeline validate some-pipeline.json --plugins ./my-plugin
```

An unknown `pluginId@pluginVersion` in any manifest is an **error** — there is
no fallback binding (D-FCP-5 fail-closed posture).

## 4. Implementation reality

Binding manifest → code happens in the consuming runtime's **build-time**
plugin registry (SLOT-FCP-REACTOR), not here. No dynamic loading, no
entrypoint fields, no demo/mock/synthetic fallback paths in production
(D-FCP-8): a failure surfaces per the node's declared failure policy.
