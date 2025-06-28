# AFI‑Factory

**AFI‑Factory** is where agent templates are registered, versioned, and spawned across the AFI Protocol.

This repo is designed for both human engineers and Factory.ai agents to contribute base-level agent templates.

## Structure

| Folder/File | Purpose |
| ----------- | ------- |
| `factory_intro.md` | Overview of agent production lifecycle |
| `agent_manifest.json` | Registry of agent templates and logic modules |
| `template_registry.ts` | Programmatic interface for loading templates |

Agents defined here should be linked by ID into `afi-protocol/factory/agent_manifest.json`.
