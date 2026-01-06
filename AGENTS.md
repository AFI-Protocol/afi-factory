# afi-factory — Agent Instructions

**afi-factory** is the agent factory and template library for AFI Protocol. It provides agent templates, factory manifests, and task runners for creating and configuring AFI agents.

**Global Authority**: All agents operating in AFI Protocol repos must follow `afi-config/codex/governance/droids/AFI_DROID_CHARTER.v0.1.md`. If this AGENTS.md conflicts with the Charter, **the Charter wins**.

---

## Build & Test

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Type check
npm run typecheck

# Run tests (placeholder - no tests yet)
npm test
```

**Expected outcomes**: TypeScript compiles without errors. Tests are placeholder (exit 0).

---

## Run Locally / Dev Workflow

This repo has no dev server. Typical workflow:

1. Edit agent templates in `templates/` or `agents/`
2. Update factory manifests
3. Run `npm run build` to compile TypeScript
4. Test templates by instantiating them in target repos

---

## Architecture Overview

**Purpose**: Define how agents/droids are minted, configured, and orchestrated via Factory.

**Key directories**:
- `templates/` — Agent templates and boilerplates
- `agents/` — Agent definitions and manifests
- `factory/` — Factory orchestration logic
- `.afi-codex.json` — This repo's Codex metadata

**Consumed by**: afi-core, afi-reactor, afi-starters, and agent deployment workflows.

---

## Security

- **Template injection risks**: Agent templates are executed by droids. Validate all template variables.
- **No secrets in templates**: Use environment variables or secure vaults.
- **Factory manifests are contracts**: Changes can affect agent behavior system-wide.

---

## Git Workflows

- **Base branch**: `main` or `migration/multi-repo-reorg`
- **Branch naming**: `feat/`, `fix/`, `docs/`, `refactor/`
- **Commit messages**: Conventional commits (e.g., `feat(templates): add validator agent template`)
- **Before committing**: Run `npm run build && npm run typecheck`

---

## Conventions & Patterns

- **Language**: TypeScript (ESM)
- **Style**: Follow existing patterns in templates
- **Template naming**: kebab-case (e.g., `validator-agent.yaml`)
- **Manifest format**: YAML or JSON

---

## Scope & Boundaries for Agents

**Allowed**:
- Add or modify factory templates and manifests when requested
- Improve template documentation
- Add new agent archetypes (validator, scorer, mentor, etc.)
- Update factory orchestration logic with clear spec

**Forbidden**:
- Introduce new external service dependencies without clear explanation
- Change template contracts that break existing agent deployments
- Add runtime logic that belongs in afi-core or afi-reactor
- Hardcode secrets or production URLs in templates

**When unsure**: Propose changes in PR with clear rationale. Prefer extending templates over replacing them.

---

**Last Updated**: 2025-11-26  
**Maintainers**: AFI Factory Team  
**Charter**: `afi-config/codex/governance/droids/AFI_DROID_CHARTER.v0.1.md`

