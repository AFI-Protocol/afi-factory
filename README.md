# AFI‑Factory

**Agent templates, versioning, and spawning for AFI Protocol**

## Purpose

`afi-factory` is where agent templates are registered, versioned, and spawned across the AFI Protocol. This repository provides:

- **Agent templates** - Base templates for AFI agents
- **Template registry** - Programmatic interface for loading and versioning templates
- **Agent manifest** - Registry of agent templates and logic modules
- **Spawning logic** - Agent instantiation and lifecycle management

This repo is designed for both human engineers and Factory.ai agents to contribute base-level agent templates.

## What Belongs Here

✅ Agent templates and blueprints
✅ Template registry and versioning logic
✅ Agent manifest definitions
✅ Agent spawning utilities
✅ Template validation and testing

## What Does NOT Belong Here

❌ Agent runtime code (→ `afi-core`)
❌ Agent orchestration (→ `afi-reactor`)
❌ Agent skills (→ `afi-skills`)

## Current Stage

**Phase 1 Scaffolding** - Template registry and manifest are established. Agent spawning logic is in development.

## Structure

| Folder/File | Purpose |
| ----------- | ------- |
| `factory_intro.md` | Overview of agent production lifecycle |
| `agent_manifest.json` | Registry of agent templates and logic modules |
| `template_registry.ts` | Programmatic interface for loading templates |
| `.afi-codex.json` | Repository metadata |

Agents defined here should be linked by ID into `afi-protocol/factory/agent_manifest.json`.

## Intended Droid Work

Factory.ai droids can contribute:

- New agent templates
- Template versioning improvements
- Agent spawning logic
- Template validation tests
- Documentation and examples

## Related Repositories

- **afi-core** - Agent runtime
- **afi-reactor** - Agent orchestration
- **afi-skills** - Agent skills library

## License

MIT
