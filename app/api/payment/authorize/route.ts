import { NextResponse } from "next/server";
import { authorizePayment } from "../../../../lib/payments/service";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { productId?: unknown; extraIds?: unknown; policies?: unknown; userApproval?: unknown; idempotencyKey?: unknown };
    if (typeof body.productId !== "string" || !Array.isArray(body.extraIds) || !body.extraIds.every((x) => typeof x === "string") || typeof body.idempotencyKey !== "string") throw new Error("INVALID_PRODUCTS");
    // Browser policy values are display-only; financial authorization reads server policy state.
    const quote = authorizePayment(body.productId, body.extraIds, undefined, body.userApproval === true, body.idempotencyKey);
    return NextResponse.json({ transactionId: quote.transactionId, amount: quote.amount, currency: quote.currency, state: quote.state, retryCount: (quote as { retryCount?: number }).retryCount ?? 0 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "PAYMENT_NOT_READY";
    const message = code === "POLICY_BLOCKED" ? "This transaction is blocked by policy." : code === "AWAITING_USER_APPROVAL" ? "User approval is required before payment can be prepared." : code === "IDEMPOTENCY_CONFLICT" ? "This payment key belongs to a different transaction." : "Payment is not ready for approval.";
    return NextResponse.json({ error: message, code }, { status: 400 });
  }
}
