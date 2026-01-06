/**
 * Type tests for afi-factory/schemas/index.ts
 *
 * These tests verify that TypeScript interfaces are correctly defined
 * and that type guards work as expected.
 *
 * This file uses type assertions to verify type compatibility
 * without requiring a test framework.
 */
import { type EnrichmentNodeConfig, type AnalystConfig, type ValidatedAnalystConfig, type TemplateRegistryEntry, type LoadAnalystConfigOptions } from '../index';
declare const validEnrichmentNodeConfig: EnrichmentNodeConfig;
declare const minimalEnrichmentNodeConfig: EnrichmentNodeConfig;
declare const ingressNodeConfig: EnrichmentNodeConfig;
declare const validAnalystConfig: AnalystConfig;
declare const minimalAnalystConfig: AnalystConfig;
declare const validValidatedAnalystConfig: ValidatedAnalystConfig;
declare const invalidValidatedAnalystConfig: ValidatedAnalystConfig;
declare const validTemplateRegistryEntry: TemplateRegistryEntry;
declare const validLoadAnalystConfigOptions: LoadAnalystConfigOptions;
declare const defaultLoadAnalystConfigOptions: LoadAnalystConfigOptions;
export { validEnrichmentNodeConfig, minimalEnrichmentNodeConfig, ingressNodeConfig, validAnalystConfig, minimalAnalystConfig, validValidatedAnalystConfig, invalidValidatedAnalystConfig, validTemplateRegistryEntry, validLoadAnalystConfigOptions, defaultLoadAnalystConfigOptions, };
