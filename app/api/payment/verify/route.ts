import { NextResponse } from "next/server";
import { verifyPaymentSignature } from "../../../../lib/payments/razorpay";
import { markFailed, verifyTrustedPayment } from "../../../../lib/payments/service";
export async function POST(request: Request) {
  let transactionId: string | undefined;
  try {
    const b = await request.json() as { transactionId?: unknown; razorpay_order_id?: unknown; razorpay_payment_id?: unknown; razorpay_signature?: unknown };
    transactionId = typeof b.transactionId === "string" ? b.transactionId : undefined;
    if (!transactionId || typeof b.razorpay_order_id !== "string" || typeof b.razorpay_payment_id !== "string" || typeof b.razorpay_signature !== "string") throw new Error();
    if (!verifyPaymentSignature(b.razorpay_order_id, b.razorpay_payment_id, b.razorpay_signature)) throw new Error("SIGNATURE_INVALID");
    const payment = verifyTrustedPayment(transactionId, b.razorpay_order_id);
    return NextResponse.json({ status: payment.state, paymentId: b.razorpay_payment_id, orderId: b.razorpay_order_id, verifiedAt: new Date().toISOString() });
  } catch {
    const failure = transactionId ? markFailed(transactionId) : undefined;
    return NextResponse.json({ error: "Payment verification failed.", retryAllowed: failure?.retryAllowed ?? false, retryCount: failure?.retryCount ?? 0, maximumRetries: failure?.maximumRetries ?? 0 }, { status: 400 });
  }
}
