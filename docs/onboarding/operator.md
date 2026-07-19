# Operator onboarding — installing and running validation

You are installing afi-factory to validate composition artifacts (CI gates,
registry review, pre-deployment checks). Factory executes nothing and needs
no services, no credentials, and no sibling checkouts.

## Install

```sh
git clone https://github.com/AFI-Protocol/afi-factory
cd afi-factory
npm ci        # Node >= 20; installs ajv, ajv-formats, commander (+ dev tooling)
npm run build # emits dist/ and the afi-factory bin
npm test      # full suite: drift guard, hashing KATs, semantics, CLI behaviour
```

`npm ci` from a clean clone is the supported path — the governed afi-config
contracts are **vendored and byte-pinned** in `src/governed-schema/`
(provenance in `MANIFEST.json`). To additionally byte-verify the vendored
closure against a pinned afi-config checkout (CI always does), set
`AFI_CONFIG_DIR=/path/to/afi-config@<pinned commit>` before `npm test` (the
pinned commit is `afiConfigCommit` in `src/governed-schema/MANIFEST.json`).

## Day-to-day commands

```sh
afi-factory pipeline validate <manifest> --plugins <plugin-dir> [--json]
afi-factory pipeline inspect <manifest> [--json]
afi-factory template validate|instantiate <template> ...
afi-factory analyst-config validate <config> --pipeline <manifest> --plugins <dir>
afi-factory hash <file> [--kind pipeline|analyst-config|plugin-set] [--json]
```

Exit code contract: `0` = validated OK; nonzero = invalid input or usage
error. `--json` gives machine-readable results for gating scripts. Trust exit
codes over any summary text.

## What capabilities mean for you

Plugin manifests declare **requirement classes** the runtime environment must
satisfy. The official froggy set's five category-lane plugins each declare
`provider:instance-backed`: the concrete provider is selected per lane by the
manifest's explicit `providerInstanceRef` (the committed refs form the
all-five keyless/self-hosted reference profile; the `aiMl` lane pins the
Tiny Brains provider instance). Factory only surfaces these declarations and
non-secret references; resolving instances and any operator credentials (BYOK)
is runtime operator configuration (afi-reactor side), never stored in any
artifact.

## Failure posture

Everything fails closed and honestly: invalid JSON, schema violations, graph
violations, unknown plugin identities, hash-pin divergences, and missing
required template parameters all produce nonzero exits with JSON-pointer
error paths. There are no demo/mock/synthetic fallbacks (D-FCP-8).
