/**
 * Type tests for afi-factory/schemas/index.ts
 *
 * These tests verify that TypeScript interfaces are correctly defined
 * and that type guards work as expected.
 *
 * This file uses type assertions to verify type compatibility
 * without requiring a test framework.
 */
import { isEnrichmentNodeConfig, isAnalystConfig, isValidatedAnalystConfig, } from '../index';
// ============================================================================
// EnrichmentNodeConfig Type Tests
// ============================================================================
const validEnrichmentNodeConfig = {
    id: 'price-enricher',
    type: 'enrichment',
    plugin: 'afi-price-enricher',
    enabled: true,
    optional: false,
    parallel: false,
    dependencies: [],
    config: {
        sources: ['coingecko', 'coinmarketcap'],
        updateInterval: 60,
    },
};
const minimalEnrichmentNodeConfig = {
    id: 'sentiment-analyzer',
    type: 'enrichment',
    plugin: 'afi-sentiment-plugin',
    enabled: true,
};
const ingressNodeConfig = {
    id: 'onchain-tracker',
    type: 'ingress',
    plugin: 'afi-onchain-tracker',
    enabled: true,
    optional: false,
    parallel: false,
    dependencies: [],
    config: {
        networks: ['ethereum', 'polygon'],
        confirmations: 12,
    },
};
// ============================================================================
// AnalystConfig Type Tests
// ============================================================================
const validAnalystConfig = {
    analystId: 'crypto-analyst',
    version: 'v1.0.0',
    enrichmentNodes: [
        {
            id: 'price-enricher',
            type: 'enrichment',
            plugin: 'afi-price-enricher',
            enabled: true,
        },
        {
            id: 'sentiment-analyzer',
            type: 'enrichment',
            plugin: 'afi-sentiment-plugin',
            enabled: true,
            optional: true,
        },
    ],
    metadata: {
        description: 'Crypto analyst focused on DeFi protocols',
        author: 'AFI Team',
        createdAt: '2024-12-26T10:00:00Z',
        updatedAt: '2024-12-26T15:30:00Z',
    },
};
const minimalAnalystConfig = {
    analystId: 'equity-trader',
    enrichmentNodes: [
        {
            id: 'market-data-fetcher',
            type: 'ingress',
            plugin: 'afi-market-data-plugin',
            enabled: true,
        },
    ],
};
// ============================================================================
// ValidatedAnalystConfig Type Tests
// ============================================================================
const validValidatedAnalystConfig = {
    analystId: 'crypto-analyst',
    version: 'v1.0.0',
    enrichmentNodes: [
        {
            id: 'price-enricher',
            type: 'enrichment',
            plugin: 'afi-price-enricher',
            enabled: true,
        },
    ],
    valid: true,
    errors: [],
    warnings: [],
};
const invalidValidatedAnalystConfig = {
    analystId: 'crypto-analyst',
    enrichmentNodes: [],
    valid: false,
    errors: ['Missing enrichment nodes'],
    warnings: ['Version not specified'],
};
// ============================================================================
// TemplateRegistryEntry Type Tests
// ============================================================================
const validTemplateRegistryEntry = {
    id: 'crypto-analyst',
    type: 'analyst-config',
    path: './analyst-configs/crypto-analyst.json',
    schemaId: 'https://afi-protocol.org/schemas/analyst-config.schema.json',
    version: 'v1.0.0',
};
// ============================================================================
// LoadAnalystConfigOptions Type Tests
// ============================================================================
const validLoadAnalystConfigOptions = {
    validate: true,
    cache: true,
    configDir: './analyst-configs',
};
const defaultLoadAnalystConfigOptions = {};
// ============================================================================
// Type Guard Tests
// ============================================================================
// Test isEnrichmentNodeConfig
const enrichmentNodeConfigTest1 = {
    id: 'price-enricher',
    type: 'enrichment',
    plugin: 'afi-price-enricher',
    enabled: true,
};
if (isEnrichmentNodeConfig(enrichmentNodeConfigTest1)) {
    const id = enrichmentNodeConfigTest1.id;
    const type = enrichmentNodeConfigTest1.type;
    const plugin = enrichmentNodeConfigTest1.plugin;
    const enabled = enrichmentNodeConfigTest1.enabled;
}
// Test isAnalystConfig
const analystConfigTest1 = {
    analystId: 'crypto-analyst',
    enrichmentNodes: [
        {
            id: 'price-enricher',
            type: 'enrichment',
            plugin: 'afi-price-enricher',
            enabled: true,
        },
    ],
};
if (isAnalystConfig(analystConfigTest1)) {
    const analystId = analystConfigTest1.analystId;
    const enrichmentNodes = analystConfigTest1.enrichmentNodes;
}
// Test isValidatedAnalystConfig
const validatedAnalystConfigTest1 = {
    analystId: 'crypto-analyst',
    enrichmentNodes: [
        {
            id: 'price-enricher',
            type: 'enrichment',
            plugin: 'afi-price-enricher',
            enabled: true,
        },
    ],
    valid: true,
    errors: [],
    warnings: [],
};
if (isValidatedAnalystConfig(validatedAnalystConfigTest1)) {
    const valid = validatedAnalystConfigTest1.valid;
    const errors = validatedAnalystConfigTest1.errors;
    const warnings = validatedAnalystConfigTest1.warnings;
}
// ============================================================================
// Type Compatibility Tests
// ============================================================================
// Test that EnrichmentNodeConfig can be used in AnalystConfig
const analystConfigWithNodes = {
    analystId: 'test-analyst',
    enrichmentNodes: [validEnrichmentNodeConfig, minimalEnrichmentNodeConfig],
};
// Test that AnalystConfig can be extended to ValidatedAnalystConfig
const validatedConfig = {
    ...validAnalystConfig,
    valid: true,
    errors: [],
    warnings: [],
};
// Test that config can be passed to functions expecting specific types
function processEnrichmentNode(node) {
    console.log(`Processing node: ${node.id}`);
}
function processAnalystConfig(config) {
    console.log(`Processing analyst: ${config.analystId}`);
}
function processValidatedConfig(config) {
    console.log(`Validated: ${config.valid}`);
}
processEnrichmentNode(validEnrichmentNodeConfig);
processAnalystConfig(validAnalystConfig);
processValidatedConfig(validValidatedAnalystConfig);
// ============================================================================
// Export for type checking
// ============================================================================
export { validEnrichmentNodeConfig, minimalEnrichmentNodeConfig, ingressNodeConfig, validAnalystConfig, minimalAnalystConfig, validValidatedAnalystConfig, invalidValidatedAnalystConfig, validTemplateRegistryEntry, validLoadAnalystConfigOptions, defaultLoadAnalystConfigOptions, };
