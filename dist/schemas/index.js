/**
 * AFI Factory - Analyst Configuration Types
 *
 * This file defines TypeScript interfaces for analyst configurations,
 * bridging afi-config schemas with afi-reactor orchestration.
 *
 * These interfaces are strongly typed and compatible with the JSON schemas
 * defined in afi-config/schemas/analyst-config.schema.json and
 * afi-config/schemas/definitions/enrichment-node.schema.json.
 *
 * @module afi-factory/schemas/index
 */
/**
 * Type guard to check if an object is an EnrichmentNodeConfig
 */
export function isEnrichmentNodeConfig(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const config = obj;
    return (typeof config.id === 'string' &&
        (config.type === 'enrichment' || config.type === 'ingress') &&
        typeof config.plugin === 'string' &&
        typeof config.enabled === 'boolean');
}
/**
 * Type guard to check if an object is an AnalystConfig
 */
export function isAnalystConfig(obj) {
    if (typeof obj !== 'object' || obj === null) {
        return false;
    }
    const config = obj;
    return (typeof config.analystId === 'string' &&
        Array.isArray(config.enrichmentNodes) &&
        config.enrichmentNodes.every(isEnrichmentNodeConfig));
}
/**
 * Type guard to check if an object is a ValidatedAnalystConfig
 */
export function isValidatedAnalystConfig(obj) {
    if (!isAnalystConfig(obj)) {
        return false;
    }
    const config = obj;
    return (typeof config.valid === 'boolean' &&
        (config.errors === undefined || Array.isArray(config.errors)) &&
        (config.warnings === undefined || Array.isArray(config.warnings)));
}
