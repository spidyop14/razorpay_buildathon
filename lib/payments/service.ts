import { randomUUID } from "crypto";
import { buildOfferPreview } from "../buyer";
import { getProduct } from "../catalog";
import { defaultPolicies } from "../policy/default-policies";
import { getServerPolicies } from "../policy/server-config";
import { evaluateTransaction, validConfig } from "../policy/policy-engine";
import type { PolicyConfig } from "../policy/types";
import { createOrder } from "./razorpay";
import type { TrustedQuote } from "./types";

const QUOTE_TTL = 15 * 60_000;
const quotes = new Map<string, TrustedQuote>();
const idempotencyKeys = new Map<string, string>();
type ExtendedQuote = TrustedQuote & { idempotencyKey?: string; retryCount: number; failureReason?: string; expiresAt: number };

function calculate(productId: string, extraIds: string[], policyConfig?: PolicyConfig, userApproval = false, paymentAttempt = 0) {
  const product = getProduct(productId);
  const extras = extraIds.map(getProduct);
  if (!product || extras.some((item) => !item) || new Set(extraIds).size !== extraIds.length) throw new Error("INVALID_PRODUCTS");
  const offer = buildOfferPreview(product, extras.filter((item): item is NonNullable<typeof item> => Boolean(item)));
  const policies = policyConfig && validConfig(policyConfig) ? policyConfig : getServerPolicies();
  const evaluation = evaluateTransaction({ productId, basePrice: offer.subtotal, proposedPrice: offer.finalAmount, merchantCost: offer.items.reduce((sum, item) => sum + item.price - item.margin, 0), environment: "test", paymentAttempt, userApproval }, policies);
  return { offer, policies, evaluation };
}

/** Server-authoritative recalculation. Client totals and discounts are never accepted. */
export function recalculate(productId: string, extraIds: string[], policyConfig?: PolicyConfig, userApproval = false, paymentAttempt = 0) {
  const { offer, evaluation } = calculate(productId, extraIds, policyConfig, userApproval, paymentAttempt);
  return { amount: offer.finalAmount, subtotal: offer.subtotal, discount: offer.discount, merchantMargin: evaluation.derived.merchantMargin, state: evaluation.state, checks: evaluation.checks };
}

export function authorizePayment(productId: string, extraIds: string[], policies?: PolicyConfig, userApproval = true, idempotencyKey?: string) {
  if (idempotencyKey) {
    const existingId = idempotencyKeys.get(idempotencyKey);
    const existing = existingId ? quotes.get(existingId) as ExtendedQuote | undefined : undefined;
    if (existing) {
      if (existing.productId !== productId || existing.extraIds.join("|") !== extraIds.join("|")) throw new Error("IDEMPOTENCY_CONFLICT");
      if (Date.now() > existing.expiresAt) throw new Error("QUOTE_EXPIRED");
      return existing;
    }
  }
  const { offer, policies: activePolicies, evaluation } = calculate(productId, extraIds, policies, userApproval);
  if (evaluation.state !== "APPROVED") throw new Error(evaluation.state);
  const now = Date.now();
  const trusted: ExtendedQuote = { transactionId: randomUUID(), productId, extraIds: [...extraIds], amount: offer.finalAmount, currency: "INR", state: "READY_FOR_PAYMENT", createdAt: now, expiresAt: now + QUOTE_TTL, policies: activePolicies, idempotencyKey, retryCount: 0 };
  quotes.set(trusted.transactionId, trusted);
  if (idempotencyKey) idempotencyKeys.set(idempotencyKey, trusted.transactionId);
  return trusted;
}

export async function createTrustedOrder(transactionId: string) {
  const trusted = quotes.get(transactionId) as ExtendedQuote | undefined;
  if (!trusted) throw new Error("PAYMENT_NOT_READY");
  if (Date.now() > trusted.expiresAt || Date.now() - trusted.createdAt > QUOTE_TTL) throw new Error("PAYMENT_NOT_READY");
  if (trusted.state === "PAYMENT_SUCCESS") throw new Error("PAYMENT_COMPLETED");
  if (trusted.razorpayOrderId && trusted.razorpayAmount != null) return { orderId: trusted.razorpayOrderId, amount: trusted.razorpayAmount, currency: trusted.razorpayCurrency || "INR", keyId: process.env.RAZORPAY_KEY_ID as string, reused: true, retryCount: trusted.retryCount };
  if (trusted.state !== "READY_FOR_PAYMENT") throw new Error("PAYMENT_NOT_READY");
  const { evaluation } = calculate(trusted.productId, trusted.extraIds, trusted.policies, true, trusted.retryCount);
  if (evaluation.state !== "APPROVED") throw new Error(evaluation.state);
  const order = await createOrder(trusted.amount, `ac_${transactionId.slice(0, 18)}`);
  trusted.state = "PAYMENT_INITIATED";
  trusted.razorpayOrderId = order.id;
  trusted.razorpayAmount = order.amount;
  trusted.razorpayCurrency = order.currency;
  return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID as string, reused: false, retryCount: trusted.retryCount };
}

export function verifyTrustedPayment(transactionId: string, orderId: string) {
  const trusted = quotes.get(transactionId) as ExtendedQuote | undefined;
  if (!trusted || trusted.razorpayOrderId !== orderId || trusted.state !== "PAYMENT_INITIATED") throw new Error("PAYMENT_NOT_READY");
  trusted.state = "PAYMENT_SUCCESS";
  return trusted;
}

export function markFailed(transactionId: string, reason = "Payment verification failed.") {
  const trusted = quotes.get(transactionId) as ExtendedQuote | undefined;
  if (!trusted || trusted.state === "PAYMENT_SUCCESS") return undefined;
  trusted.retryCount += 1;
  trusted.failureReason = reason;
  const maximumRetries = trusted.policies?.maximumPaymentRetries ?? defaultPolicies.maximumPaymentRetries;
  trusted.state = "PAYMENT_FAILED";
  return { trusted, retryAllowed: trusted.retryCount < maximumRetries, retryCount: trusted.retryCount, maximumRetries };
}

export function getPaymentStatus(transactionId: string) {
  const trusted = quotes.get(transactionId) as ExtendedQuote | undefined;
  if (!trusted) return undefined;
  return { state: trusted.state, retryCount: trusted.retryCount, maximumRetries: trusted.policies?.maximumPaymentRetries ?? defaultPolicies.maximumPaymentRetries, failureReason: trusted.failureReason, expired: Date.now() > trusted.expiresAt };
}

export const _testQuotes = quotes;
export const _testIdempotencyKeys = idempotencyKeys;
