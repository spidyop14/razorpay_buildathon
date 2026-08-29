import { NextResponse } from "next/server";
import { markFailed } from "../../../../lib/payments/service";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { transactionId?: unknown; reason?: unknown };
    if (typeof body.transactionId !== "string") {
      throw new Error("Missing transactionId");
    }
    
    const reason = typeof body.reason === "string" ? body.reason : "Razorpay payment rejected";
    const failure = markFailed(body.transactionId, reason);
    
    if (!failure) {
      throw new Error("Could not mark transaction as failed");
    }
    
    return NextResponse.json({
      status: "PAYMENT_FAILED",
      retryAllowed: failure.retryAllowed,
      retryCount: failure.retryCount,
      maximumRetries: failure.maximumRetries
    });
  } catch (error) {
    return NextResponse.json({ error: "Failed to record payment failure" }, { status: 400 });
  }
}
