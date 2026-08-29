import test from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "crypto";
import { verifyPaymentSignature } from "./razorpay.ts";
import {
  authorizePayment,
  createTrustedOrder,
  verifyTrustedPayment,
  markFailed,
  recalculate,
  _testQuotes,
} from "./service.ts";
import { defaultPolicies } from "../policy/default-policies.ts";

test("verifies a valid Razorpay-style signature", () => {
  const secret = "test_secret";
  const signature = createHmac("sha256", secret).update("order_1|pay_1").digest("hex");
  assert.equal(verifyPaymentSignature("order_1", "pay_1", signature, secret), true);
});

test("rejects invalid signatures", () =>
  assert.equal(verifyPaymentSignature("order_1", "pay_1", "invalid", "test_secret"), false));

test("creates trusted quote from catalog only", () => {
  const q = authorizePayment("lap-001", ["mouse-001"]);
  assert.equal(q.amount, 56702);
  assert.equal(q.state, "READY_FOR_PAYMENT");
});

test("rejects unknown products", () =>
  assert.throws(() => authorizePayment("not-a-product", [])));

test("authorizes valid ₹74,999 transaction with configured maximum limit", () => {
  const customPolicies = { ...defaultPolicies, maximumTransaction: 100000 };
  const q = authorizePayment("game-001", [], customPolicies, true);
  assert.equal(q.amount, 74999);
  assert.equal(q.state, "READY_FOR_PAYMENT");
});

test("blocks transaction above maximum limit", () =>
  assert.throws(() => authorizePayment("game-001", [], { ...defaultPolicies, maximumTransaction: 60000 }, true), /POLICY_BLOCKED/));

test("blocks transaction when margin is below minimum margin limit", () => {
  const highMarginPolicy = { ...defaultPolicies, minimumMerchantMargin: 15000 };
  assert.throws(
    () => authorizePayment("game-001", [], highMarginPolicy, true),
    /POLICY_BLOCKED/
  );
});

test("rejects payment preparation when user approval is missing", () =>
  assert.throws(
    () => authorizePayment("lap-001", [], defaultPolicies, false),
    /AWAITING_USER_APPROVAL/
  ));

test("idempotent order creation returns cached order if already initiated", async () => {
  const quote = authorizePayment("lap-001", []);
  quote.state = "PAYMENT_INITIATED";
  quote.razorpayOrderId = "order_cached_123";
  quote.razorpayAmount = 5599900;
  quote.razorpayCurrency = "INR";

  const res = await createTrustedOrder(quote.transactionId);
  assert.equal(res.orderId, "order_cached_123");
  assert.equal(res.amount, 5599900);
});

test("rejects order creation for expired quotes", async () => {
  const quote = authorizePayment("lap-001", []);
  quote.createdAt = Date.now() - 16 * 60_000; // 16 mins ago (> 15 min TTL)
  await assert.rejects(async () => createTrustedOrder(quote.transactionId), /PAYMENT_NOT_READY/);
});

test("verifyTrustedPayment transitions state to PAYMENT_SUCCESS on match", () => {
  const quote = authorizePayment("lap-001", []);
  quote.state = "PAYMENT_INITIATED";
  quote.razorpayOrderId = "order_test_999";

  const verified = verifyTrustedPayment(quote.transactionId, "order_test_999");
  assert.equal(verified.state, "PAYMENT_SUCCESS");
});

test("markFailed transitions state to PAYMENT_FAILED", () => {
  const quote = authorizePayment("lap-001", []);
  markFailed(quote.transactionId);
  const updated = _testQuotes.get(quote.transactionId);
  assert.equal(updated?.state, "PAYMENT_FAILED");
});

test("reuses authorization for a repeated idempotency key", () => {
  const key = `session-${Date.now()}`;
  const first = authorizePayment("lap-001", [], undefined, true, key);
  const second = authorizePayment("lap-001", [], undefined, true, key);
  assert.equal(second.transactionId, first.transactionId);
});

test("failed payments respect the retry limit", () => {
  const quote = authorizePayment("lap-001", []);
  const failed = markFailed(quote.transactionId, "declined");
  assert.equal(failed?.retryCount, 1);
  assert.equal(failed?.retryAllowed, false);
});

test("successful demo scenario (CodeLite 14 + extras) remains safely below Razorpay Test Mode 50K limit", () => {
  const quote = authorizePayment("lap-003", ["mouse-001", "bag-001"]);
  assert.equal(quote.amount, 49757); // 47999 + 799 + 1199 = 49997, discount = 240, final = 49757
  assert.equal(quote.amount < 50000, true);
  const recal = recalculate("lap-003", ["mouse-001", "bag-001"]);
  assert.equal(recal.amount, quote.amount);
});
