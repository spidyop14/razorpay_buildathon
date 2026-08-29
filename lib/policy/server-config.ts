import { defaultPolicies } from "./default-policies";
import { validConfig } from "./policy-engine";
import type { PolicyConfig } from "./types";

// Deliberately process-local for the demo. It is never read from browser storage
// or accepted as a payment API request value.
let activePolicies: PolicyConfig = { ...defaultPolicies };

export function getServerPolicies(): PolicyConfig {
  return { ...activePolicies };
}

export function updateServerPolicies(next: PolicyConfig): PolicyConfig {
  if (!validConfig(next)) throw new Error("INVALID_POLICY_CONFIGURATION");
  activePolicies = { ...next, allowedEnvironment: "test" };
  return getServerPolicies();
}

export function resetServerPolicies(): PolicyConfig {
  activePolicies = { ...defaultPolicies };
  return getServerPolicies();
}
