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
`AFI_CONFIG_DIR=/path/to/afi-config@e462c4e8` before `npm test`.

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
satisfy — e.g. the official froggy set needs `provider:price-feed`,
`provider:coinalyze` + `secret:COINALYZE_API_KEY`, `provider:newsdata` +
`secret:NEWSDATA_API_KEY`, and `service:tiny-brains`. Factory only surfaces
these declarations; provisioning the actual providers/secrets is runtime
operator configuration (afi-reactor side), never stored in any artifact.

## Failure posture

Everything fails closed and honestly: invalid JSON, schema violations, graph
violations, unknown plugin identities, hash-pin divergences, and missing
required template parameters all produce nonzero exits with JSON-pointer
error paths. There are no demo/mock/synthetic fallbacks (D-FCP-8).
