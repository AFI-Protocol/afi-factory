// This file is used to load and return agent templates.
export const loadTemplate = (templateId) => {
    switch (templateId) {
        case 'validator-v1':
            return { type: 'validator', entry: './templates/validator.ts' };
        case 'signal-emitter-basic':
            return { type: 'signal', entry: './templates/emitter.ts' };
        default:
            throw new Error('Template not found: ' + templateId);
    }
};
/**
 * Load analyst configuration for a given analyst ID.
 * Returns a ValidatedAnalystConfig object containing the analyst's configuration.
 *
 * @param analystId - The ID of the analyst to load configuration for
 * @returns The validated analyst configuration object
 * @throws Error if analyst configuration is not found
 */
export const loadAnalystConfig = async (analystId) => {
    switch (analystId) {
        case 'froggy-analyst-node':
            return {
                analystId: 'froggy-analyst-node',
                version: '1.0.0',
                enrichmentNodes: [
                    {
                        id: 'technical-indicators',
                        type: 'enrichment',
                        plugin: 'technical-indicators',
                        enabled: true,
                        optional: false,
                        parallel: false,
                        dependencies: []
                    },
                    {
                        id: 'pattern-recognition',
                        type: 'enrichment',
                        plugin: 'pattern-recognition',
                        enabled: true,
                        optional: false,
                        parallel: false,
                        dependencies: ['technical-indicators']
                    },
                    {
                        id: 'sentiment',
                        type: 'enrichment',
                        plugin: 'sentiment',
                        enabled: true,
                        optional: true,
                        parallel: true,
                        dependencies: []
                    },
                    {
                        id: 'news',
                        type: 'enrichment',
                        plugin: 'news',
                        enabled: true,
                        optional: true,
                        parallel: true,
                        dependencies: []
                    },
                    {
                        id: 'ai-ml',
                        type: 'enrichment',
                        plugin: 'ai-ml',
                        enabled: true,
                        optional: false,
                        parallel: false,
                        dependencies: ['technical-indicators', 'pattern-recognition']
                    }
                ],
                metadata: {
                    description: 'Froggy Analyst - Trend pullback detection specialist',
                    author: 'AFI Protocol',
                    createdAt: '2024-01-01T00:00:00Z',
                    updatedAt: '2024-01-01T00:00:00Z'
                },
                valid: true,
                errors: [],
                warnings: []
            };
        default:
            throw new Error('Analyst configuration not found: ' + analystId);
    }
};
