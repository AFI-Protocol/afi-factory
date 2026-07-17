import { describe, it, expect } from 'vitest';
import { join } from 'node:path';
import { validateDocument } from '../src/index.js';
import { templateViolations, instantiateTemplate } from '../src/template.js';
import type { PipelineTemplate } from '../src/generated/pipeline-template.js';
import { officialDir, officialPlugins, readJson, clone } from './helpers.js';

const officialTemplate = readJson<PipelineTemplate>(join(officialDir, 'template.json'));
const plugins = officialPlugins();

function messages(issues: { message: string }[]): string {
  return issues.map((i) => i.message).join('; ');
}

describe('template semantics (declaredSlots)', () => {
  it('the official template is schema-valid and slot-clean', () => {
    const result = validateDocument('pipeline-template', officialTemplate);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it('a slot referencing an undeclared parameter is rejected', () => {
    const t = clone(officialTemplate);
    (t.nodes[0] as any).config = { candleLimit: { $param: 'ghost' } };
    expect(messages(templateViolations(t))).toContain("undeclared parameter 'ghost'");
  });

  it('duplicate parameter names are rejected', () => {
    const t = clone(officialTemplate);
    t.parameters.push(clone(t.parameters[0]));
    expect(messages(templateViolations(t))).toContain("duplicate parameter name 'candleLimit'");
  });
});

describe('template instantiation (fail closed)', () => {
  it('instantiating with defaults produces a fully admissible manifest', () => {
    const result = instantiateTemplate(officialTemplate, {}, { plugins });
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.pipeline!.schema).toBe('afi.pipeline.v1');
    expect((result.pipeline!.nodes[0] as any).config).toEqual({ candleLimit: 100 });
    expect((result.pipeline!.nodes[3] as any).config).toEqual({ windowHours: 4 });
    // templateId/templateVersion/parameters are dropped.
    expect((result.pipeline as any).templateId).toBeUndefined();
    expect((result.pipeline as any).parameters).toBeUndefined();
  });

  it('supplied values override defaults after fragment validation', () => {
    const result = instantiateTemplate(officialTemplate, { candleLimit: 250, newsWindowHours: 24 }, { plugins });
    expect(result.ok).toBe(true);
    expect((result.pipeline!.nodes[0] as any).config).toEqual({ candleLimit: 250 });
    expect((result.pipeline!.nodes[3] as any).config).toEqual({ windowHours: 24 });
  });

  it('fails closed when a required parameter (no default) is absent', () => {
    const t = clone(officialTemplate);
    (t.parameters[0] as any).required = true;
    delete (t.parameters[0] as any).default;
    const result = instantiateTemplate(t, {});
    expect(result.ok).toBe(false);
    expect(messages(result.errors)).toContain("missing required parameter 'candleLimit'");
  });

  it('fails closed when a supplied value violates its schema fragment', () => {
    const result = instantiateTemplate(officialTemplate, { candleLimit: 0 });
    expect(result.ok).toBe(false);
    expect(messages(result.errors)).toContain("parameter 'candleLimit' fails its schema fragment");
  });

  it('fails closed on unknown supplied parameters (typos never silently no-op)', () => {
    const result = instantiateTemplate(officialTemplate, { candleLimits: 100 });
    expect(result.ok).toBe(false);
    expect(messages(result.errors)).toContain("unknown parameter 'candleLimits'");
  });

  it('fails closed when the instantiated pipeline is graph-inadmissible', () => {
    const t = clone(officialTemplate);
    t.edges = t.edges.filter((e: any) => e.to !== 'scorer');
    const result = instantiateTemplate(t, {});
    expect(result.ok).toBe(false);
    expect(messages(result.errors)).toContain('unreachable');
  });

  it('fails closed on unknown plugin bindings when a plugin set is provided', () => {
    const t = clone(officialTemplate);
    (t.nodes[0] as any).pluginVersion = '9.9.9';
    const result = instantiateTemplate(t, {}, { plugins });
    expect(result.ok).toBe(false);
    expect(messages(result.errors)).toContain('unknown plugin');
  });
});
