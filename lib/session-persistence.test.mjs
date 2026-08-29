import test from "node:test";
import assert from "node:assert/strict";
import { getProduct } from "./catalog.ts";
import {
  emptySession,
  selectCommerceProduct,
  updateOpportunityStatus,
  serializeCommerceSession,
  restoreCommerceSession,
  canTransition,
} from "./commerce-session.ts";
import { authorizePayment, recalculate } from "./payments/service.ts";
import { defaultPolicies } from "./policy/default-policies.ts";
import { validConfig } from "./policy/policy-engine.ts";

test("1. serializeCommerceSession and restoreCommerceSession round-trip a complete session", () => {
  const base = selectCommerceProduct(emptySession(), getProduct("lap-001"), {
    raw: "coding laptop under 60k",
    category: "laptop",
    maxBudget: 60000,
    requirements: { ram: "16GB" },
    useCase: "coding",
  });
  const updated = {
    ...base,
    extras: ["mouse-001"],
    step: 5,
    userApproved: true,
    transactionPhase: "USER_APPROVED",
  };
  const serialized = serializeCommerceSession(updated);
  const restored = restoreCommerceSession(serialized);

  assert.equal(restored.selectedProduct?.id, "lap-001");
  assert.equal(restored.extras.length, 1);
  assert.equal(restored.extras[0], "mouse-001");
  assert.equal(restored.userApproved, true);
  assert.equal(restored.step, 5);
  assert.equal(restored.transactionPhase, "USER_APPROVED");
  assert.equal(restored.intent?.category, "laptop");
});

test("2. restoreCommerceSession rejects expired sessions", () => {
  const expiredData = {
    sessionId: "COM-expired",
    createdAt: Date.now() - 7200000,
    expiresAt: Date.now() - 3600000,
    selectedProductId: "lap-001",
  };
  const restored = restoreCommerceSession(expiredData);
  assert.equal(restored.selectedProduct, undefined);
  assert.equal(restored.extras.length, 0);
  assert.equal(restored.transactionPhase, "IDLE");
});

test("3. restoreCommerceSession rejects sessions with unknown product IDs", () => {
  const invalidProduct = {
    sessionId: "COM-123",
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    selectedProductId: "non-existent-product",
  };
  const restored = restoreCommerceSession(invalidProduct);
  assert.equal(restored.selectedProduct, undefined);
  assert.equal(restored.transactionPhase, "IDLE");
});

test("4. restoreCommerceSession filters out invalid extras and keeps valid ones", () => {
  const data = {
    sessionId: "COM-456",
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    selectedProductId: "lap-001",
    extras: ["mouse-001", "fake-mouse-999", "bag-001"],
  };
  const restored = restoreCommerceSession(data);
  assert.deepEqual(restored.extras, ["mouse-001", "bag-001"]);
});

test("5. restoreCommerceSession resets in-flight payment states to USER_APPROVED", () => {
  const inFlightData = {
    sessionId: "COM-789",
    createdAt: Date.now(),
    expiresAt: Date.now() + 3600000,
    selectedProductId: "lap-001",
    transactionPhase: "PAYMENT_INITIATED",
  };
  const restored = restoreCommerceSession(inFlightData);
  assert.equal(restored.transactionPhase, "USER_APPROVED");
});

test("6. emptySession initializes with clean default properties", () => {
  const s = emptySession();
  assert.ok(s.sessionId.startsWith("COM-"));
  assert.equal(s.extras.length, 0);
  assert.equal(s.userApproved, false);
  assert.equal(s.step, -1);
  assert.equal(s.transactionPhase, "IDLE");
  assert.equal(s.opportunities.length, 0);
});

test("7. selectCommerceProduct resets extras, approval, and generates fresh opportunities", () => {
  const s1 = selectCommerceProduct(emptySession(), getProduct("lap-001"));
  assert.equal(s1.selectedProduct?.id, "lap-001");
  assert.ok(s1.opportunities.length > 0);
  assert.ok(s1.opportunities.every((o) => o.primaryProduct.id === "lap-001"));

  // Switching product recomputes opportunities for new product
  const s2 = selectCommerceProduct(s1, getProduct("game-001"));
  assert.equal(s2.selectedProduct?.id, "game-001");
  assert.ok(s2.opportunities.every((o) => o.primaryProduct.id === "game-001"));
  assert.equal(s2.extras.length, 0);
  assert.equal(s2.userApproved, false);
  assert.equal(s2.transactionPhase, "PRODUCT_SELECTED");
});

test("8. canTransition enforces state machine flow", () => {
  assert.equal(canTransition("IDLE", "PRODUCT_SELECTED"), true);
  assert.equal(canTransition("PRODUCT_SELECTED", "POLICY_CHECKED"), true);
  assert.equal(canTransition("POLICY_CHECKED", "USER_APPROVED"), true);
  assert.equal(canTransition("USER_APPROVED", "PAYMENT_READY"), true);
  assert.equal(canTransition("PAYMENT_READY", "PAYMENT_INITIATED"), true);
  assert.equal(canTransition("PAYMENT_INITIATED", "PAYMENT_SUCCESS"), true);
  assert.equal(canTransition("PAYMENT_INITIATED", "PAYMENT_FAILED"), true);
  // Disallowed transitions
  assert.equal(canTransition("IDLE", "PAYMENT_SUCCESS"), false);
  assert.equal(canTransition("PRODUCT_SELECTED", "PAYMENT_INITIATED"), false);
  assert.equal(canTransition("PAYMENT_SUCCESS", "PAYMENT_INITIATED"), false);
});

test("9. server recalculation produces exact financial breakdown independently", () => {
  const result = recalculate("lap-001", ["mouse-001"], defaultPolicies, true);
  assert.equal(result.subtotal, 56798);
  assert.equal(result.discount, 96);
  assert.equal(result.amount, 56702);
  assert.equal(result.state, "APPROVED");
  assert.ok(result.merchantMargin >= 3000);
});

test("10. server recalculation blocks transactions exceeding maximum limit", () => {
  const result = recalculate("game-001", [], { ...defaultPolicies, maximumTransaction: 60000 }, true);
  assert.equal(result.state, "POLICY_BLOCKED");
  assert.ok(result.checks.some((c) => c.status === "blocked" && c.policy === "maximum_transaction"));
});

test("11. server recalculation reports pending approval when userApproval is false", () => {
  const result = recalculate("lap-001", [], defaultPolicies, false);
  assert.equal(result.state, "AWAITING_USER_APPROVAL");
});

test("12. server rejects nonexistent products during recalculation", () => {
  assert.throws(() => recalculate("fake-item-id", []), /INVALID_PRODUCTS/);
});

test("13. server rejects duplicate extra items", () => {
  assert.throws(() => recalculate("lap-001", ["mouse-001", "mouse-001"]), /INVALID_PRODUCTS/);
});

test("14. server recalculation enforces minimum merchant margin", () => {
  const tightPolicy = { ...defaultPolicies, minimumMerchantMargin: 10000 };
  const result = recalculate("lap-001", [], tightPolicy, true);
  assert.equal(result.state, "POLICY_BLOCKED");
  assert.ok(result.checks.some((c) => c.status === "blocked" && c.policy === "minimum_margin"));
});

test("15. validConfig safely validates policy parameters", () => {
  assert.equal(validConfig(defaultPolicies), true);
  assert.equal(validConfig({ ...defaultPolicies, maximumTransaction: -1 }), false);
  assert.equal(validConfig({ ...defaultPolicies, maximumDiscountPercent: 150 }), false);
  assert.equal(validConfig({ ...defaultPolicies, minimumMerchantMargin: -500 }), false);
  assert.equal(validConfig({ ...defaultPolicies, allowedEnvironment: "live" }), false);
});

test("16. updateOpportunityStatus isolates merchant status per opportunity", () => {
  const s = selectCommerceProduct(emptySession(), getProduct("lap-001"));
  if (s.opportunities.length > 0) {
    const targetId = s.opportunities[0].id;
    const next = updateOpportunityStatus(s, targetId, "MERCHANT_APPROVED");
    assert.equal(next.opportunities.find((o) => o.id === targetId)?.status, "MERCHANT_APPROVED");
  }
});

test("17. restore keeps buyer discovery intent when no product is selected yet", () => {
  const discovery = {
    ...emptySession(),
    buyerQuery: "Gaming setup under ₹80K",
    intent: {
      raw: "Gaming setup under ₹80K",
      category: "gaming-laptop",
      maxBudget: 80000,
      requirements: {},
      useCase: "gaming",
    },
    step: 5,
  };
  const restored = restoreCommerceSession(serializeCommerceSession(discovery));
  assert.equal(restored.selectedProduct, undefined);
  assert.equal(restored.buyerQuery, "Gaming setup under ₹80K");
  assert.equal(restored.intent?.category, "gaming-laptop");
  assert.equal(restored.intent?.maxBudget, 80000);
  assert.equal(restored.step, 5);
  assert.equal(restored.transactionPhase, "IDLE");
});

test("18. product selection still updates shared commerce session after discovery", () => {
  const intent = {
    raw: "Gaming setup under ₹80K",
    category: "gaming-laptop",
    maxBudget: 80000,
    requirements: {},
    useCase: "gaming",
  };
  const discovered = {
    ...emptySession(),
    intent,
    buyerQuery: intent.raw,
    step: 5,
  };
  const selected = selectCommerceProduct(discovered, getProduct("game-001"), intent);
  assert.equal(selected.selectedProduct?.id, "game-001");
  assert.equal(selected.intent?.useCase, "gaming");
  assert.ok(selected.opportunities.length > 0);
  assert.ok(selected.opportunities.every((x) => x.primaryProduct.id === "game-001"));
  assert.equal(selected.transactionPhase, "PRODUCT_SELECTED");
});
