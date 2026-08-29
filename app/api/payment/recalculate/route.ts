import { NextResponse } from "next/server";
import { recalculate } from "../../../../lib/payments/service";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      productId?: unknown;
      extraIds?: unknown;
      userApproval?: unknown;
    };
    if (
      typeof body.productId !== "string" ||
      !Array.isArray(body.extraIds) ||
      !body.extraIds.every((x) => typeof x === "string")
    )
      throw new Error("INVALID_PRODUCTS");

    const userApproval = body.userApproval === true;
    const result = recalculate(
      body.productId,
      body.extraIds,
      undefined,
      userApproval
    );
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : "RECALCULATION_FAILED";
    const message =
      code === "INVALID_PRODUCTS"
        ? "Invalid product configuration."
        : code === "POLICY_BLOCKED"
          ? "This transaction is blocked by policy."
          : "Server recalculation failed.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
