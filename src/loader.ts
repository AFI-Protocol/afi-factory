/**
 * loadAndValidate: reads one artifact document from disk and validates it —
 * strict AJV against the vendored governed schema, then the artifact kind's
 * semantic layer. Every error carries a JSON-pointer path. `ok:true` is only
 * ever returned after real validation executed.
 */
import { readFileSync } from 'node:fs';
import type { PipelineManifest } from './generated/pipeline.js';
import type { PipelineTemplate } from './generated/pipeline-template.js';
import type { AnalystStrategyConfig } from './generated/analyst-strategy-config.js';
import type { AnalystStrategyRegistration } from './generated/analyst-strategy-registration.js';
import type { ProviderStrategyBinding } from './generated/provider-strategy-binding.js';
import {
  detectKind,
  validateAgainstSchema,
  type ArtifactKind,
  type ValidationIssue,
} from './schemas.js';
import { pipelineGraphViolations, pluginBindingViolations, type PluginSet } from './graph.js';
import { templateViolations } from './template.js';
import { analystConfigViolations, analystConfigCrossViolations } from './analyst-config.js';

export interface LoadAndValidateOptions {
  /** Plugin-manifest set for binding checks (pipeline / analyst-config overrides). */
  plugins?: PluginSet;
  /** Referenced pipeline manifest for analyst-config cross-artifact checks. */
  pipeline?: PipelineManifest;
}

export interface LoadAndValidateResult<T = unknown> {
  ok: boolean;
  kind: ArtifactKind;
  errors: ValidationIssue[];
  /** Present iff the document parsed (even when invalid). */
  document?: T;
}

function majorAgreementViolation(
  strategyId: string,
  strategyVersion: string,
  pointer: string
): ValidationIssue | undefined {
  const m = /_v(0|[1-9]\d*)$/.exec(strategyId);
  if (!m) return undefined;
  const versionMajor = strategyVersion.split('.')[0];
  if (m[1] !== versionMajor) {
    return {
      pointer,
      message: `strategyId embeds major v${m[1]} but strategyVersion '${strategyVersion}' has major ${versionMajor}`,
    };
  }
  return undefined;
}

/** Semantic layer for one already-schema-valid document. */
export function semanticViolations(
  kind: ArtifactKind,
  doc: unknown,
  options: LoadAndValidateOptions = {}
): ValidationIssue[] {
  switch (kind) {
    case 'pipeline': {
      const errors = pipelineGraphViolations(doc);
      if (errors.length === 0 && options.plugins) {
        errors.push(...pluginBindingViolations(doc as PipelineManifest, options.plugins));
      }
      return errors;
    }
    case 'pipeline-template':
      return templateViolations(doc as PipelineTemplate);
    case 'analyst-strategy-config': {
      const config = doc as AnalystStrategyConfig;
      const errors = analystConfigViolations(config);
      if (options.pipeline) {
        errors.push(...analystConfigCrossViolations(config, options.pipeline, { plugins: options.plugins }));
      }
      return errors;
    }
    case 'analyst-strategy-registration': {
      const reg = doc as AnalystStrategyRegistration;
      const issue = majorAgreementViolation(reg.strategyId, reg.strategyVersion, '/strategyId');
      return issue ? [issue] : [];
    }
    case 'provider-strategy-binding': {
      const binding = doc as ProviderStrategyBinding;
      const errors: ValidationIssue[] = [];
      binding.allowedStrategies.forEach((t, i) => {
        const issue = majorAgreementViolation(t.strategyId, t.strategyVersion, `/allowedStrategies/${i}/strategyId`);
        if (issue) errors.push(issue);
      });
      if (binding.defaultStrategy) {
        const member = binding.allowedStrategies.some(
          (t) =>
            t.analystId === binding.defaultStrategy!.analystId &&
            t.strategyId === binding.defaultStrategy!.strategyId &&
            t.strategyVersion === binding.defaultStrategy!.strategyVersion
        );
        if (!member) {
          errors.push({
            pointer: '/defaultStrategy',
            message: 'defaultStrategy is not a member of allowedStrategies (x-afiConstraints.defaultMembership)',
          });
        }
      }
      return errors;
    }
    default:
      return [];
  }
}

/** Full validation (schema + semantics) of an in-memory document. */
export function validateDocument<T = unknown>(
  kind: ArtifactKind,
  doc: unknown,
  options: LoadAndValidateOptions = {}
): LoadAndValidateResult<T> {
  const schemaResult = validateAgainstSchema(kind, doc);
  const errors = [...schemaResult.errors];
  if (schemaResult.ok) errors.push(...semanticViolations(kind, doc, options));
  return { ok: errors.length === 0, kind, errors, document: doc as T };
}

/** Reads + fully validates one artifact file. */
export function loadAndValidate<T = unknown>(
  kind: ArtifactKind,
  filePath: string,
  options: LoadAndValidateOptions = {}
): LoadAndValidateResult<T> {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (e) {
    return { ok: false, kind, errors: [{ pointer: '', message: `cannot read '${filePath}': ${(e as Error).message}` }] };
  }
  let doc: unknown;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    return { ok: false, kind, errors: [{ pointer: '', message: `invalid JSON in '${filePath}': ${(e as Error).message}` }] };
  }
  return validateDocument<T>(kind, doc, options);
}

export { detectKind };
