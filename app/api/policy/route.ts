import { NextResponse } from "next/server";
import { getServerPolicies, updateServerPolicies } from "../../../lib/policy/server-config";
import type { PolicyConfig } from "../../../lib/policy/types";

export function GET() { return NextResponse.json({ policies: getServerPolicies() }); }

export async function PUT(request: Request) {
  try {
    const body = await request.json() as { policies?: PolicyConfig };
    if (!body.policies) throw new Error("INVALID_POLICY_CONFIGURATION");
    return NextResponse.json({ policies: updateServerPolicies(body.policies) });
  } catch {
    return NextResponse.json({ error: "Policy configuration is invalid." }, { status: 400 });
  }
}
