# Provider binding onboarding

You are declaring which **strategies** an authenticated signal provider may
route into — the `afi.provider-strategy-binding.v1` document.

## What a binding declares

- `bindingId` — stable id, referenced by registration
  `providerBindingPolicy.allowedBindings` entries;
- `providerId` — the provider identity (same id space as USS
  `provenance.providerId`);
- `providerType` — ingress class: `webhook` | `cpj` | `gateway`;
- `authenticatedBy` — the authentication **class** (`route-secret` |
  `gateway-tenant` | `integration-key`). Secret/tenant/key **values** live in
  operator configuration — the contract has nowhere to put them, by design;
- `allowedStrategies` — the whitelist of canonical strategy triples
  (`analystId` + `strategyId` + `strategyVersion`);
- `defaultStrategy` — optional; MUST be deep-equal to a member of
  `allowedStrategies` (factory-validated, fail closed);
- `status` — only `active` bindings route; retire with `inactive`, never
  delete.

## Validate

Factory validates binding documents (schema + the default-membership and
strategyId-major cross-field rules) via the library
(`loadAndValidate('provider-strategy-binding', file)`); routing itself is the
runtime's job and **fails closed** for triples that do not resolve to an
active registration admitting your binding.

## The resolution chain

```
provider (authenticated) -> binding.allowedStrategies -> registration (active)
  -> analyst-strategy-config (hash-pinned) -> pipeline manifest (hash-pinned)
```

Every arrow is fail-closed: an unknown/inactive identity or a hash divergence
refuses to execute — no silent identity fallback, ever (D-FCP-5).
