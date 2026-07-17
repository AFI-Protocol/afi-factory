/**
 * Pipeline template semantics + instantiation — the afi.pipeline-template.v1
 * tooling contract (declaredSlots + the instantiation algorithm recorded in
 * the schema's x-afiConstraints.instantiation), mirroring the afi-config
 * test-suite semantics:
 *
 *  (1) validate supplied values against each parameter's schema fragment;
 *  (2) apply defaults for absent optional parameters;
 *  (3) fail closed if a required parameter (required:true, no default) is absent;
 *  (4) deep-replace every {"$param":"<name>"} slot with its resolved value;
 *  (5) drop templateId/templateVersion/parameters, set schema 'afi.pipeline.v1';
 *  (6) the result MUST validate against the full pipeline contract
 *      (schema + graph semantics) or instantiation fails closed.
 */
import type { PipelineTemplate } from './generated/pipeline-template.js';
import type { PipelineManifest } from './generated/pipeline.js';
import { createFragmentAjv, validateAgainstSchema, type ValidationIssue } from './schemas.js';
import { pipelineGraphViolations, pluginBindingViolations, type PluginSet } from './graph.js';

function collectSlots(x: unknown, found: string[] = []): string[] {
  if (Array.isArray(x)) {
    x.forEach((item) => collectSlots(item, found));
    return found;
  }
  if (x && typeof x === 'object') {
    const keys = Object.keys(x);
    if (keys.length === 1 && keys[0] === '$param' && typeof (x as { $param: unknown }).$param === 'string') {
      found.push((x as { $param: string }).$param);
      return found;
    }
    keys.forEach((k) => collectSlots((x as Record<string, unknown>)[k], found));
  }
  return found;
}

/**
 * Template tooling constraints (x-afiConstraints.declaredSlots): unique
 * parameter names; every slot references a declared parameter.
 */
export function templateViolations(t: unknown): ValidationIssue[] {
  const v: ValidationIssue[] = [];
  if (!t || typeof t !== 'object') return [{ pointer: '', message: 'template is not structurally readable' }];
  const doc = t as PipelineTemplate;
  const params = Array.isArray(doc.parameters) ? doc.parameters : [];
  const names = params.map((p) => p?.name);
  const seen = new Set<string>();
  names.forEach((name, i) => {
    if (seen.has(name)) v.push({ pointer: `/parameters/${i}/name`, message: `duplicate parameter name '${name}'` });
    seen.add(name);
  });
  const declared = new Set(names);
  for (const slot of collectSlots({ nodes: doc.nodes, edges: doc.edges })) {
    if (!declared.has(slot)) {
      v.push({ pointer: '/nodes', message: `slot references undeclared parameter '${slot}'` });
    }
  }
  return v;
}

export interface InstantiationResult {
  ok: boolean;
  errors: ValidationIssue[];
  /** Present iff ok: a fully admissible afi.pipeline.v1 manifest. */
  pipeline?: PipelineManifest;
}

/**
 * Instantiates a template into a concrete afi.pipeline.v1 manifest, failing
 * closed on missing/invalid parameters and on any schema/graph inadmissibility
 * of the result. When a plugin set is provided the instantiated manifest is
 * additionally binding-checked against it.
 */
export function instantiateTemplate(
  template: PipelineTemplate,
  supplied: Record<string, unknown>,
  options: { plugins?: PluginSet } = {}
): InstantiationResult {
  const errors: ValidationIssue[] = [];
  const fragmentAjv = createFragmentAjv();

  // Unknown supplied parameters fail closed (a typo must never silently no-op).
  const declaredNames = new Set(template.parameters.map((p) => p.name));
  for (const name of Object.keys(supplied)) {
    if (!declaredNames.has(name)) {
      errors.push({ pointer: '/parameters', message: `unknown parameter '${name}' supplied` });
    }
  }

  const resolved: Record<string, unknown> = {};
  for (const [i, p] of template.parameters.entries()) {
    let value: unknown;
    if (Object.prototype.hasOwnProperty.call(supplied, p.name)) value = supplied[p.name];
    else if (Object.prototype.hasOwnProperty.call(p, 'default')) value = p.default;
    else if (p.required) {
      errors.push({ pointer: `/parameters/${i}`, message: `missing required parameter '${p.name}'` });
      continue;
    } else continue;
    try {
      const validateParam = fragmentAjv.compile(p.schema as object);
      if (!validateParam(value)) {
        for (const err of validateParam.errors ?? []) {
          errors.push({
            pointer: `/parameters/${i}`,
            message: `parameter '${p.name}' fails its schema fragment${err.instancePath ? ` at ${err.instancePath}` : ''}: ${err.message ?? 'violation'}`,
          });
        }
        continue;
      }
    } catch (e) {
      errors.push({
        pointer: `/parameters/${i}/schema`,
        message: `parameter '${p.name}' schema fragment failed to compile: ${(e as Error).message}`,
      });
      continue;
    }
    resolved[p.name] = value;
  }
  if (errors.length) return { ok: false, errors };

  const substitute = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(substitute);
    if (x && typeof x === 'object') {
      const keys = Object.keys(x);
      if (keys.length === 1 && keys[0] === '$param') {
        const name = (x as { $param: string }).$param;
        if (!(name in resolved)) {
          errors.push({ pointer: '/nodes', message: `unresolved slot '${name}'` });
          return null;
        }
        return resolved[name];
      }
      const out: Record<string, unknown> = {};
      keys.forEach((k) => (out[k] = substitute((x as Record<string, unknown>)[k])));
      return out;
    }
    return x;
  };

  const pipeline: Record<string, unknown> = {
    schema: 'afi.pipeline.v1',
    pipelineId: template.pipelineId,
    pipelineVersion: template.pipelineVersion,
  };
  if (template.description !== undefined) pipeline.description = template.description;
  pipeline.entry = template.entry;
  pipeline.nodes = substitute(template.nodes);
  pipeline.edges = substitute(template.edges);
  if (template.metadata !== undefined) pipeline.metadata = template.metadata;
  if (errors.length) return { ok: false, errors };

  // (6) fail closed unless the result is fully admissible.
  const schemaResult = validateAgainstSchema('pipeline', pipeline);
  errors.push(...schemaResult.errors);
  if (schemaResult.ok) {
    errors.push(...pipelineGraphViolations(pipeline));
    if (errors.length === 0 && options.plugins) {
      errors.push(...pluginBindingViolations(pipeline as unknown as PipelineManifest, options.plugins));
    }
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, errors: [], pipeline: pipeline as unknown as PipelineManifest };
}
