import test from "node:test";
import assert from "node:assert/strict";
import { defaultPolicies } from "./default-policies.ts";
import { getServerPolicies, resetServerPolicies, updateServerPolicies } from "./server-config.ts";

test("server policy source is independent from caller objects", () => {
  resetServerPolicies();
  const input = { ...defaultPolicies, maximumTransaction: 90000 };
  updateServerPolicies(input);
  input.maximumTransaction = 1;
  assert.equal(getServerPolicies().maximumTransaction, 90000);
  resetServerPolicies();
});
