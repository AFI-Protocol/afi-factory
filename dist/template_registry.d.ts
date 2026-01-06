export declare const loadTemplate: (templateId: string) => {
    type: string;
    entry: string;
};
/**
 * Load analyst configuration for a given analyst ID.
 * Returns a ValidatedAnalystConfig object containing the analyst's configuration.
 *
 * @param analystId - The ID of the analyst to load configuration for
 * @returns The validated analyst configuration object
 * @throws Error if analyst configuration is not found
 */
export declare const loadAnalystConfig: (analystId: string) => Promise<{
    analystId: string;
    version: string;
    enrichmentNodes: {
        id: string;
        type: string;
        plugin: string;
        enabled: boolean;
        optional: boolean;
        parallel: boolean;
        dependencies: string[];
    }[];
    metadata: {
        description: string;
        author: string;
        createdAt: string;
        updatedAt: string;
    };
    valid: boolean;
    errors: never[];
    warnings: never[];
}>;
