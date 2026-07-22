# AFI Factory

**AFI Factory is the strategy workshop for Agentic Financial Intelligence.**

Factory helps traders, quants, builders, and agents turn market ideas into
repeatable **AFI-powered workflows** — deciding what signals to watch, what
analysis to run, how scoring should apply, and how the workflow connects into
AFI. Factory prepares the **playbook**; it does not trade, and it does not score.

**Where Factory sits in AFI:**

- **Factory** builds the playbooks — the strategy and agent workflows.
- **Machine** scores the signals.
- **Gateway** provides protocol access.
- **MCP** connects agents.
- **BUY SELL TERMINAL**, if and when built, is the trader-facing cockpit.

**You work with Factory through three surfaces**, all backed by one authoring
engine:

- a **local CLI** — for advanced users and operators to create, check, and
  prepare strategy workflows;
- an **MCP interface** — so an agent can help design, check, and prepare those
  workflows;
- a **TypeScript library** — to build on the same authoring functions directly.

> **Under the hood** — Factory is the analyst-configurable pipeline *authoring*
> implementation (SLOT-FCP-FACTORY, authorized by
> `afi-governance/decisions/factory-configurable-pipelines-v1.md`, D-FCP-4). The
> contract-level mechanics — pipeline manifests, canonical hashing, and the typed
> operation layer — are documented in the technical sections below and remain exact.

## What Factory is / is not

**Factory is:**

- a **strategy-workflow authoring surface** — define what a strategy watches,
  what analysis runs, and how scoring applies;
- a **local CLI** for preparing and checking AFI workflows;
- an **agent-facing MCP surface** for designing and validating workflows;
- a **developer-accessible TypeScript library**.

**Factory is not:**

- a trading terminal or trade-execution system;
- the scoring engine — that is **Machine**;
- the protocol gateway — that is **Gateway**;
- a hosted web app or visual editor;
- a wallet, rewards, or settlement surface.

Factory prepares the playbook; other AFI surfaces run it.

## The Factory CLI is not a trading terminal

The `afi-factory` CLI is an **authoring** tool. It creates, checks, and prepares
AFI strategy workflows — it never places an order, connects to a broker, moves a
position, or runs a live strategy.

A trader-facing cockpit — **BUY SELL TERMINAL** or another future app — is a
separate surface built for traders. A trader may act through such a terminal, a
web app, or an agent, while Factory works behind the scenes to prepare the
workflow those surfaces rely on.

Factory prepares the playbook; the terminal (when it exists) is where a trader
acts on it.

## Authoring capabilities

- **Template authoring + instantiation** — author `afi.pipeline-template.v1`
  documents with `{"$param":"<name>"}` value slots; instantiate them (defaults
  applied, values validated against each parameter's schema fragment, fail
  closed) into concrete `afi.pipeline.v1` manifests.
- **Manifest validation** — strict AJV validation against the **vendored,
  byte-pinned** afi-config contract closure (`src/governed-schema/`, pinned to
  afi-config `d6f2504805059ffa09d8c1bfcecb67cd47abcea2`), plus the semantic
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

## Connect an agent (MCP)

**Connect an agent to Factory so it can help design, check, and prepare
AFI-powered strategy workflows.** For example: a quant tells their agent *"draft
a momentum strategy that watches 15-minute candles, add a sentiment check, and
score it with an AFI scoring template."* The agent uses Factory's tools to draft
and assemble the workflow, validate it against the available analysis steps,
inspect the execution graph, and give it a verifiable workflow fingerprint —
without a person hand-writing a manifest. Factory only *authors and checks*; the
agent never trades or scores through it.

Under the hood, every authoring capability above is exposed to agents through
**one implementation-backed operation registry** (`src/operations/`). The
TypeScript library, the `afi-factory` CLI, the machine-readable capability
catalog, the generic agent-tool definitions, and the MCP interface are all
**projections over the same typed operation handlers** — a capability cannot
exist without a real handler, a validated input schema, a validated output
schema, a declared filesystem/security policy, and test coverage. Changing or
removing an operation changes every projection.

- **Machine-readable capability discovery** — `afi-factory capabilities --json`
  emits a deterministic catalog (stable id-sorted order, no timestamps/paths/
  usernames; equivalent registries hash identically via `--hash`).
- **Generic (framework-neutral) agent-tool definitions** — `capabilities --tools`
  emits neutral `{ name, description, inputSchema }` tools suitable for any
  function-calling / tool-using agent system; no framework is the authority.
- **MCP-compatible stdio adapter** — `afi-factory agent serve --transport stdio
  [--workspace <dir>]` speaks newline-delimited JSON-RPC 2.0 (`initialize`,
  `tools/list`, `tools/call`). It opens no network listener, executes no shell,
  performs no dynamic import, and grants no filesystem access beyond a mutating
  operation's declared workspace boundary.
- **Pipeline-component discovery** — `factory.plugins.list` surfaces each
  analysis-plugin's category, version, schema refs, determinism, params schema,
  `multiInstance`, and `mayFeedScorer`, plus the five analyst-configurable
  categories (`technical`, `pattern`, `sentiment`, `news`, `aiMl`).
- **Fail-closed filesystem boundary** — every mutating operation
  (`factory.plugin.scaffold`, `factory.artifact.package`) writes ONLY inside an
  explicit workspace root; traversal, absolute-path escape, symlink escape,
  symlinked-parent escape, and unauthorized overwrite fail closed on canonical
  paths (never string prefixes).

The operation layer is implementation metadata for authoring AFI pipeline
artifacts. It is not a network-wide capability catalog: mapping externally
exposed capabilities across AFI services is reserved for the future API Atlas,
which this repo neither implements nor claims.

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
  official/froggy-trend-pullback/pipeline.manifest.json \
  --plugins official/froggy-trend-pullback/plugins

# inspect the graph (waves, node table, joins)
npx afi-factory pipeline inspect \
  official/froggy-trend-pullback/pipeline.manifest.json

# hash the official manifest (matches the canonical composition pin)
npx afi-factory hash official/froggy-trend-pullback/pipeline.manifest.json \
  --kind pipeline --json

# cross-validate the analyst config against its pinned manifest
npx afi-factory analyst-config validate \
  official/froggy-trend-pullback/analyst-config.json \
  --pipeline official/froggy-trend-pullback/pipeline.manifest.json \
  --plugins official/froggy-trend-pullback/plugins

# start a new pipeline project (scaffolds a value-parameterized template)
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
`afi.d2.plugin-set` (pluginSetHash) — exactly as listed in the vendored
spec's exclusion table
([`canonical-json-hashing.v1.md` §3](src/governed-schema/canonical-json-hashing.v1.md),
W3a amendment). The domain tag is carried on the reference, never mixed
into the digest.

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
[`official/froggy-trend-pullback/hashes.json`](official/froggy-trend-pullback/hashes.json)
and are recomputed + asserted by CI on every run — they equal the pins carried
by the canonical analyst-strategy registration and the runtime composition
provenance, and downstream waves pin them.

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

## Official composition: froggy-trend-pullback v1.3.0

[`official/froggy-trend-pullback/`](official/froggy-trend-pullback/) carries
**byte-identical copies of the canonical afi-config registry records** for the
current official composition on the five-lane provider runtime: the registered
pipeline manifest `froggy-trend-pullback v1.3.0`, the canonical
analyst-strategy config, the seven bound plugin manifests, and the committed
canonical hash pins (`hashes.json`).

The v1.3.0 graph: a `technical` entry fanning out to `pattern` (via the
`candles` port), `sentiment`, and `news`; the `aiMl` lane joining the four
sibling lane outputs; one deterministic five-category `namespace-by-node`
merge; and the single `afi-scorer-froggy-trend-pullback` sink. Every category
lane selects its provider through an explicit `providerInstanceRef` (the
all-five keyless/self-hosted reference profile; the `aiMl` lane pins the
Tiny Brains provider-instance record 1.1.0), and **all five lanes are
required**: the lanes are fail-fast under the governed default — a failed
lane yields no scored evaluation.

Because provider selection is authored at the **manifest** layer and templates
parameterize *values, never topology or provider selection*, the official
provider-backed composition is not template-produced: Factory vendors the
canonical records directly and validates, hashes, inspects, and packages them.

The eight configurability proof graphs live under
[`fixtures/conformance/`](fixtures/conformance/) — clearly non-production
fixtures exercised by the test suite.

## Persona docs

- [Quant: authoring a strategy workflow](docs/onboarding/quant-authoring.md)
- [Plugin developer](docs/onboarding/plugin-developer.md)
- [Provider binding](docs/onboarding/provider-binding.md)
- [Operator: installing and running validation](docs/onboarding/operator.md)
- [AFI City — Factory landmark copy (handoff)](docs/afi-city-copy.md)

## License

MIT — see [LICENSE](LICENSE).
