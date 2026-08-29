import { NextResponse } from "next/server";
import { explainRecommendation } from "../../../../lib/ai/service";
import type { Intent, Recommendation } from "../../../../lib/buyer";
export async function POST(request:Request){try{const body=await request.json() as {message?:unknown;intent?:Intent;recommendation?:Recommendation};if(typeof body.message!=="string"||!body.intent||!body.recommendation)return NextResponse.json({error:"Missing verified recommendation context."},{status:400});const explanation=await explainRecommendation(body.message,body.intent,body.recommendation);return NextResponse.json({explanation,mode:explanation?"ai":"fallback"})}catch{return NextResponse.json({explanation:null,mode:"fallback"})}}
