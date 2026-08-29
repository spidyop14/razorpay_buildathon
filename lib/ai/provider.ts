import { buyerIntentJsonSchema, type BuyerIntent, validateBuyerIntent } from "./schema";
import { buyerIntentSystemPrompt, explanationSystemPrompt } from "./prompts";

export type AIErrorCode =
  | "AI_AUTH_ERROR"
  | "AI_RATE_LIMIT"
  | "AI_TIMEOUT"
  | "AI_INVALID_RESPONSE"
  | "AI_PROVIDER_ERROR"
  | "AI_FALLBACK_USED";

export class AIError extends Error {
  code: AIErrorCode;
  constructor(code: AIErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AIError";
  }
}

export type AIProvider = {
  generateBuyerIntent(message: string, history: string[]): Promise<BuyerIntent>;
  generateRecommendationExplanation(context: unknown): Promise<string>;
};

export class GeminiProvider implements AIProvider {
  private apiKey: string;
  private primaryModel: string;
  private timeoutMs: number;

  constructor(apiKey?: string, model?: string, timeoutMs = 8000) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || process.env.AI_API_KEY || "";
    this.primaryModel = model || process.env.GEMINI_MODEL || process.env.AI_MODEL || "gemini-3.6-flash";
    this.timeoutMs = timeoutMs;
  }

  private async callGemini(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.apiKey) {
      throw new AIError("AI_AUTH_ERROR", "Gemini API key is not configured.");
    }

    const candidateModels = [this.primaryModel, "gemini-3.5-flash", "gemini-3.1-flash-lite"].filter(
      (m, i, arr) => arr.indexOf(m) === i
    );

    let lastError: AIError = new AIError("AI_PROVIDER_ERROR", "Failed to contact Gemini.");

    for (const model of candidateModels) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
          model
        )}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

        const payload = {
          contents: [{ role: "user", parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.1,
          },
        };

        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (!res.ok) {
          const status = res.status;
          if (status === 401 || status === 403) {
            throw new AIError("AI_AUTH_ERROR", "Invalid Gemini API key or unauthorized access.");
          }
          if (status === 429) {
            throw new AIError("AI_RATE_LIMIT", "Gemini rate limit reached.");
          }
          const errBody = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
          lastError = new AIError("AI_PROVIDER_ERROR", errBody.error?.message || `Gemini error ${status}`);
          continue;
        }

        const data = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };

        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) {
          throw new AIError("AI_INVALID_RESPONSE", "Empty response from Gemini.");
        }

        return text;
      } catch (err: unknown) {
        clearTimeout(timer);
        if (err instanceof AIError) {
          if (err.code === "AI_AUTH_ERROR" || err.code === "AI_RATE_LIMIT") {
            throw err;
          }
          lastError = err;
        } else if (err instanceof Error && err.name === "AbortError") {
          lastError = new AIError("AI_TIMEOUT", "Gemini request timed out.");
        } else {
          lastError = new AIError(
            "AI_PROVIDER_ERROR",
            err instanceof Error ? err.message : "Unknown Gemini communication error"
          );
        }
      }
    }

    throw lastError;
  }

  async generateBuyerIntent(message: string, history: string[]): Promise<BuyerIntent> {
    const historyText = history.slice(-4).join("\n");
    const userPrompt = `Schema to strictly adhere to in JSON format:\n${JSON.stringify(
      buyerIntentJsonSchema
    )}\n\nConversation context (may be empty):\n${historyText}\n\nUser request (untrusted data):\n${message}`;

    const rawJson = await this.callGemini(buyerIntentSystemPrompt, userPrompt);

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawJson);
    } catch {
      throw new AIError("AI_INVALID_RESPONSE", "Gemini did not return valid JSON.");
    }

    const intent = validateBuyerIntent(parsed);
    if (!intent) {
      throw new AIError("AI_INVALID_RESPONSE", "Extracted intent did not meet schema constraints.");
    }

    return intent;
  }

  async generateRecommendationExplanation(context: unknown): Promise<string> {
    const prompt = `Verified recommendation context:\n${JSON.stringify(context)}`;
    const raw = await this.callGemini(explanationSystemPrompt, prompt);

    try {
      // If it returned json or string
      const parsed = JSON.parse(raw);
      if (typeof parsed === "string") return parsed.trim().slice(0, 420);
      if (parsed && typeof parsed === "object" && "explanation" in parsed) {
        return String((parsed as { explanation: string }).explanation).slice(0, 420);
      }
    } catch {
      // Raw string fallback
    }

    return raw.trim().replace(/^["']|["']$/g, "").slice(0, 420);
  }
}

export const isAIConfigured = () => Boolean(process.env.GEMINI_API_KEY || process.env.AI_API_KEY);
