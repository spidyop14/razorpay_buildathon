import { parseBuyerRequest, type Intent, type Recommendation } from "../buyer";
import { isAIConfigured, GeminiProvider, type AIProvider, AIError, type AIErrorCode } from "./provider";

export type IntelligenceResult = {
  intent: Intent;
  mode: "ai" | "fallback";
  notice?: string;
  clarifications: string[];
  diagnostic?: {
    code: AIErrorCode;
    reason: string;
  };
};

export async function understandBuyerRequest(
  message: string,
  history: string[] = [],
  provider?: AIProvider
): Promise<IntelligenceResult> {
  const fallback = (code: AIErrorCode = "AI_FALLBACK_USED", reason = "Deterministic local parser invoked"): IntelligenceResult => {
    const intent = parseBuyerRequest(message);
    const notice =
      code === "AI_AUTH_ERROR"
        ? "Gemini API key is not configured. We used the local commerce parser, so your catalog results are still available."
        : code === "AI_RATE_LIMIT"
        ? "Gemini rate limit reached. We used the local commerce parser, so your catalog results are still available."
        : code === "AI_TIMEOUT"
        ? "Gemini response timed out. We used the local commerce parser, so your catalog results are still available."
        : "Gemini understanding is temporarily unavailable. We used the local commerce parser, so your catalog results are still available.";

    return {
      intent: { ...intent, confidence: 0.62, clarificationNeeded: !intent.category },
      mode: "fallback",
      notice,
      clarifications: !intent.category
        ? ["What are you shopping for?", "What is your approximate budget?", "What will you use it for?"]
        : [],
      diagnostic: { code, reason },
    };
  };

  if (!provider && !isAIConfigured()) {
    return fallback("AI_AUTH_ERROR", "No API key configured");
  }

  try {
    const ai = provider || new GeminiProvider();
    const structured = await ai.generateBuyerIntent(message, history);
    const intent: Intent = { raw: message, ...structured };
    return {
      intent,
      mode: "ai",
      clarifications: structured.clarificationNeeded
        ? ["What are you shopping for?", "What is your approximate budget?", "What will you use it for?"]
        : [],
    };
  } catch (err: unknown) {
    if (err instanceof AIError) {
      return fallback(err.code, err.message);
    }
    return fallback("AI_PROVIDER_ERROR", err instanceof Error ? err.message : "Unknown error");
  }
}

export async function explainRecommendation(
  request: string,
  intent: Intent,
  recommendation: Recommendation,
  provider?: AIProvider
): Promise<string | undefined> {
  const context = {
    request,
    intent: {
      category: intent.category,
      maxBudget: intent.maxBudget,
      requirements: intent.requirements,
      useCase: intent.useCase,
    },
    product: {
      name: recommendation.product.name,
      price: recommendation.product.price,
      specifications: recommendation.product.specifications,
      stock: recommendation.product.stock,
    },
    matchFactors: recommendation.reasons,
    tradeoffs: recommendation.tradeoffs,
  };

  if (!provider && !isAIConfigured()) return undefined;

  try {
    const ai = provider || new GeminiProvider();
    return await ai.generateRecommendationExplanation(context);
  } catch {
    return undefined;
  }
}
