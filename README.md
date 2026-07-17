# afi-factory

The AFI **pipeline authoring system** — the replaceable authoring implementation of
the analyst-configurable pipelines program (SLOT-FCP-FACTORY, authorized by
`afi-governance/decisions/factory-configurable-pipelines-v1.md`, D-FCP-4).

## What Factory does

- **Template authoring + instantiation** — author `afi.pipeline-template.v1`
  documents with `{"$param":"<name>"}` value slots; instantiate them (defaults
  applied, values validated against each parameter's schema fragment, fail
  closed) into concrete `afi.pipeline.v1` manifests.
- **Manifest validation** — strict AJV validation against the **vendored,
  byte-pinned** afi-config contract closure (`src/governed-schema/`, pinned to
  afi-config `e462c4e8bef5fda946ca19a826f5c53c6d202151`), plus the semantic
  graph layer the schemas delegate to tooling: unique node ids, known edge
  endpoints, Kahn acyclicity, exactly one non-bypassable scorer sink,
  join-declaration rules, `prefer:` parent checks, condition-path
  well-formedness, timeout/retry bounds, and — against a provided
  plugin-manifest set — category/plugin binding checks (unknown
  pluginId/version is an **error**, never a fallback), `paramsSchema` config
  validation, `multiInstance`, `permittedFailurePolicies`, `mayFeedScorer`,
  and category-level ordering constraints.
- **Canonical hashing** — `canonical-json-hashing.v1` exactly per the governed
  spec, proven against all six vendored KAT vectors on every test run.
- **Graph inspection** — execution order, parallel waves (Kahn levels), node
  table, join/condition summaries; human text and `--json`.
- **Plugin scaffolding** — `afi.analysis-plugin.v1` manifest skeletons plus a
  TypeScript implementation-contract stub.

## What Factory does NOT do

- It is **not a protocol authority**: the canonical contracts live in
  afi-config; nothing Factory emits is canonical until validated against them.
- It is **not the executor**: no pipeline runs here (afi-reactor is the
  governed runtime), no plugin code is loaded, no dynamic imports — manifests
  bind plugins by `pluginId`+`pluginVersion` only; binding to code happens in
  the consuming runtime's build-time registry.
- It does **not** persist evidence, touch lifecycle states, or talk to any
  store or network service.
- There is **no visual editor** and **no execution of untrusted code**:
  conditions are bounded declarative predicate trees (pure data), and
  templates parameterize *values*, never topology.

## Registration vs configuration

Two distinct acts, never conflated:

- **Configuration** (this repo's output): authoring a template, instantiating
  a manifest, writing an `afi.analyst-strategy-config.v1`. Selecting a UWR
  profile or decay template in a config **confers nothing** — no recognition,
  no qualification, no rewards.
- **Registration** (D-FCP-5): an administrative, schema-validated, reviewed
  registry update in afi-config (`afi.analyst-strategy-registration.v1`,
  provider bindings). The runtime **fails closed** for unknown, unregistered,
  or inactive identities. Factory validates registration/binding documents but
  does not perform registration.

## Local validation walkthrough

```sh
npm ci && npm run build

# validate the official manifest against the official plugin set
npx afi-factory pipeline validate \
  templates/official/froggy-trend-pullback/pipeline.manifest.json \
  --plugins templates/official/froggy-trend-pullback/plugins

# inspect the graph (waves, node table, joins)
npx afi-factory pipeline inspect \
  templates/official/froggy-trend-pullback/pipeline.manifest.json

# instantiate the official template (defaults) and hash the result
npx afi-factory template instantiate \
  templates/official/froggy-trend-pullback/template.json \
  --plugins templates/official/froggy-trend-pullback/plugins --out /tmp/froggy.json
npx afi-factory hash /tmp/froggy.json --kind pipeline --json

# cross-validate the analyst config against its pinned manifest
npx afi-factory analyst-config validate \
  templates/official/froggy-trend-pullback/analyst-config.json \
  --pipeline templates/official/froggy-trend-pullback/pipeline.manifest.json \
  --plugins templates/official/froggy-trend-pullback/plugins

# start a new pipeline project
npx afi-factory init my-pipeline-project
```

Every command exits nonzero on invalid input, emits `--json` machine output,
and reports errors with JSON-pointer paths. No command ever reports
`valid: true` without executing real validation.

## Pipeline identity & hashing

Per D-FCP-6, pipeline identity is `pipelineId` + `pipelineVersion` + canonical
`manifestHash`. Hashing follows the governed
[`canonical-json-hashing.v1`](src/governed-schema/canonical-json-hashing.v1.md)
spec: SHA-256 over the UTF-8 bytes of the canonically serialized JSON
(recursively key-sorted objects, authored-order arrays, no whitespace,
shortest ECMAScript number form) after removing the artifact's excluded
top-level fields (`description`/`metadata` for manifests, `metadata` for
analyst configs). Conformance is pinned by the six vendored KAT vectors
(`src/governed-schema/canonical-json-hashing.kat.json`).

Domain tags carried on the emitted `CanonicalHash` objects are the
**D-FCP-7 registered composition tags**: `afi.d2.composition-manifest`
(manifestHash), `afi.d2.analyst-config` (analystConfigHash), and
`afi.d2.plugin-set` (pluginSetHash). Note: the vendored hashing spec's
exclusion table lists earlier `afi.factory.*` tag names for these artifact
types; this implementation follows the governance decision's registered
`afi.d2.*` tags — the digest **values** are identical either way (the domain
tag is carried on the reference, not mixed into the digest).

**pluginSetHash composition rule** — the canonical hash of

```json
{
  "schema": "afi.plugin-set.v1",
  "plugins": [
    { "pluginId": "...", "pluginVersion": "...", "implementationVersion": "..." }
  ]
}
```

with `plugins` sorted by `pluginId` (then `pluginVersion` for repeated ids,
plain string comparison) — order-insensitive by construction, and sensitive to
implementation upgrades via `implementationVersion`.

The committed hashes of the official artifacts live in
[`templates/official/froggy-trend-pullback/hashes.json`](templates/official/froggy-trend-pullback/hashes.json)
and are recomputed + asserted by CI on every run — downstream waves pin them.

## Failure surfacing

The D-FCP-8 posture, applied to authoring:

- missing/invalid input **fails honestly** — parse errors, schema errors, and
  graph violations are reported with JSON-pointer paths and a nonzero exit;
- instantiation **fails closed** — a missing required parameter, an ill-typed
  value, an unknown parameter, or a graph-inadmissible result is an error,
  never a silent default;
- hashing **refuses invalid artifacts** — `afi-factory hash` validates first;
- fail-soft is **declared, never implied** — `degrade` requires explicit
  `critical:false`, must be permitted by the plugin's
  `permittedFailurePolicies`, and optional join parents are explicit
  `optional:true` edges (degradations are recorded by the runtime, never
  silent).

## Graph inspection

`afi-factory pipeline inspect` (and `template inspect`) derives, from the
declared dependency structure only:

- **execution order** — a deterministic topological order;
- **parallel waves** — Kahn levels (concurrency is derived, never assumed);
- **node table** — category, plugin binding, criticality/failure policy,
  timeouts/retries, config;
- **join summary** — policy, merge strategy, conflict rule, per-parent
  optional/conditional flags;
- **condition summary** — operators and paths per gated edge.

## Official template: froggy-trend-pullback

[`templates/official/froggy-trend-pullback/`](templates/official/froggy-trend-pullback/)
carries the program's fixed 7-node design: a `technical` entry fanning out to
`pattern` (via the `candles` port), `sentiment`, and `news` branches; a
deterministic `namespace-by-node` merge (all four join edges `optional:true` —
degraded parents contribute empty namespaces); `aiMl` augmentation of the
merged view; and the single `afi-scorer-froggy-trend-pullback` sink. The
governed pipeline contract requires a **single entry with full reachability**,
so the design's "sentiment/news as additional roots" is expressed as fan-out
edges from the technical entry — sentiment, news, and pattern still execute
concurrently (wave 1 of the Kahn levels), which is the same parallel-roots
execution shape.

The eight configurability proof graphs live under
[`fixtures/conformance/`](fixtures/conformance/) — clearly non-production
fixtures exercised by the test suite.

## Persona docs

- [Quant: authoring a strategy pipeline](docs/onboarding/quant-authoring.md)
- [Plugin developer](docs/onboarding/plugin-developer.md)
- [Provider binding](docs/onboarding/provider-binding.md)
- [Operator: installing and running validation](docs/onboarding/operator.md)

## Legacy sequencing shims

`schemas/index.ts` and `template_registry.ts` are **temporary sequencing
shims** kept only so afi-reactor `main` compiles until SLOT-FCP-REACTOR /
SLOT-FCP-CLEANUP; they are scheduled for removal under SLOT-FCP-CLEANUP. Do
not use them.

## License

MIT — see [LICENSE](LICENSE).
