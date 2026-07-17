# Quant onboarding — authoring a strategy pipeline

You are composing **registered analysis plugins** into a scoring pipeline for
your strategy. You author *documents*; nothing here executes.

## 1. Start a project

```sh
npx afi-factory init my-strategy
```

This scaffolds a template, its instantiated manifest, an analyst-config pinned
by canonical hash, and two plugin manifest skeletons.

## 2. Shape the graph

Edit `template.json` (`afi.pipeline-template.v1`). The rules that will be
enforced (fail closed) at every validation:

- exactly **one scorer node**, and it must be the only sink reachable from the
  single `entry` node — no scorer bypass, no dangling branches;
- every dependency is an **explicit edge**; concurrency is *derived* from the
  dependency structure (the inspector shows you the waves), never assumed;
- any node with **more than one parent must declare a join**
  (`policy: "all"` + a merge `strategy` and `conflictRule`) — joins are
  deterministic by construction;
- **conditions are data**: bounded predicate trees (`all/any/not/exists/eq/ne/
  gt/gte/lt/lte/in`) over `/nodes/<id>/output/...` or `/context/...` paths.
  No expressions, no code strings;
- **parameters tune values, never topology**: `{"$param":"name"}` slots may
  stand in for config values, timeouts, retry knobs, condition operands, and
  plugin versions — node ids, categories, pluginIds, edges, and joins are
  concrete;
- fail-soft is explicit: `critical:false` + `failurePolicy:"degrade"` on the
  node, `optional:true` on its join edge, and the bound plugin must permit
  `degrade`.

## 3. Validate, instantiate, inspect

```sh
afi-factory template validate template.json
afi-factory template instantiate template.json --plugins plugins --out pipeline.manifest.json
afi-factory pipeline inspect pipeline.manifest.json
```

Validation against a plugin set checks your node configs against each
plugin's `paramsSchema`, category agreement, multi-instance rules, and
whether the plugins feeding your scorer are admissible scorer inputs.

## 4. Pin your identity

Your strategy identity is the OBJ-GOV triple (`analystId`, `strategyId` with
its embedded `_v<major>` token, `strategyVersion`) plus hash pins. Regenerate
the config pin whenever the manifest changes:

```sh
afi-factory analyst-config create analyst-config.json --pipeline pipeline.manifest.json \
  --analyst-id you --strategy-id your_strategy_v1 --strategy-version 1.0.0
afi-factory analyst-config validate analyst-config.json --pipeline pipeline.manifest.json --plugins plugins
```

The `pipelineRef.manifestHash` pin **fails closed** on any manifest change —
a new topology means a new `pipelineVersion` and a new hash, never a mutation.

## 5. What happens next (not here)

Registration of your config (an `afi.analyst-strategy-registration.v1` entry
in afi-config's registries) is a reviewed registry update — see the
[provider binding](provider-binding.md) and D-FCP-5 notes. Configuration
alone confers nothing: unregistered identities refuse to execute at runtime.
