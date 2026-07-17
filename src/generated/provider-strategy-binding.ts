/* GENERATED FILE — DO NOT EDIT.
 * Derived from the vendored governed schema closure (src/governed-schema/)
 * by scripts/codegen.mjs (json-schema-to-typescript). Regenerate with
 * `npm run codegen`; freshness is enforced by tests/codegen-freshness.test.ts.
 */

/**
 * The canonical provider-to-strategy binding (afi.provider-strategy-binding.v1): which STRATEGIES an authenticated signal provider may route into, and which one is the default when the inbound signal does not select one. A binding names the provider, its ingress class (providerType), the authentication CLASS that authenticates it (authenticatedBy — never secret material), the whitelist of canonical strategy triples it may invoke (allowedStrategies), an optional defaultStrategy (which MUST be a member of allowedStrategies), and an active/inactive status.
 */
export interface ProviderStrategyBinding {
  /**
   * Schema-id version of the provider strategy binding.
   */
  schema: "afi.provider-strategy-binding.v1";
  /**
   * Stable identifier of this binding (referenced by registration providerBindingPolicy.allowedBindings).
   */
  bindingId: string;
  /**
   * Stable identifier of the signal provider (same id space as USS provenance.providerId).
   */
  providerId: string;
  /**
   * Ingress class: 'webhook' (e.g. TradingView alert webhook), 'cpj' (Chat Parse JSON ingestion), 'gateway' (afi-gateway tenant ingress).
   */
  providerType: "webhook" | "cpj" | "gateway";
  /**
   * The authentication CLASS that authenticates this provider at ingress. Names the mechanism only — never carries the secret value (x-afiConstraints.noSecretMaterial).
   */
  authenticatedBy: "route-secret" | "gateway-tenant" | "integration-key";
  /**
   * Whitelist of canonical strategy identity triples this provider may route into.
   *
   * @minItems 1
   */
  allowedStrategies: [StrategyTriple, ...StrategyTriple[]];
  defaultStrategy?: StrategyTriple1;
  /**
   * Binding status. Only 'active' bindings route; 'inactive' retires without deletion.
   */
  status: "active" | "inactive";
}
/**
 * Canonical strategy identity triple (OBJ-GOV D-OBJ-3).
 */
export interface StrategyTriple {
  analystId: string;
  strategyId: string;
  strategyVersion: string;
}
/**
 * Canonical strategy identity triple (OBJ-GOV D-OBJ-3).
 */
export interface StrategyTriple1 {
  analystId: string;
  strategyId: string;
  strategyVersion: string;
}
