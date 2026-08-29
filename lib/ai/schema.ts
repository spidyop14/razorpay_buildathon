import type { Category } from "../catalog";
import { normalizeCategory, numericAmount, type Intent } from "../buyer";

const categories: Category[] = [
  "laptop",
  "gaming-laptop",
  "monitor",
  "keyboard",
  "mouse",
  "headphones",
  "laptop-bag",
  "cooling-pad",
  "webcam",
  "usb-hub",
];
const useCases = ["coding", "gaming", "college", "productivity", "travel", "music", "streaming"];

export type BuyerIntent = Omit<Intent, "raw">;

export const buyerIntentJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "category",
    "useCase",
    "minBudget",
    "maxBudget",
    "requirements",
    "preferences",
    "sortPreference",
    "confidence",
    "clarificationNeeded",
  ],
  properties: {
    category: { type: ["string", "null"], enum: [...categories, null] },
    useCase: { type: ["string", "null"], enum: [...useCases, null] },
    minBudget: { type: ["number", "null"], minimum: 0, maximum: 500000 },
    maxBudget: { type: ["number", "null"], minimum: 0, maximum: 500000 },
    requirements: {
      type: "object",
      additionalProperties: false,
      required: ["ram", "portability"],
      properties: {
        ram: { type: ["string", "null"], enum: ["8GB", "16GB", "32GB", "64GB", null] },
        portability: { type: ["string", "null"], enum: ["high", null] },
      },
    },
    preferences: {
      type: "array",
      items: { type: "string", enum: ["portability", "battery", "display", "value"] },
      maxItems: 4,
    },
    sortPreference: { type: "string", enum: ["value", "rating", "portability"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    clarificationNeeded: { type: "boolean" },
  },
};

export function validateBuyerIntent(value: unknown): BuyerIntent | undefined {
  if (!value || typeof value !== "object") return;
  const x = value as Record<string, unknown>;

  const category = x.category === null || x.category === undefined ? undefined : normalizeCategory(x.category);
  if (x.category !== null && x.category !== undefined && !category) return;

  const useCase = x.useCase === null || x.useCase === undefined ? undefined : x.useCase;
  if (useCase !== undefined && !useCases.includes(useCase as string)) return;

  const parseBudget = (key: "minBudget" | "maxBudget") => {
    if (x[key] === null || x[key] === undefined) return undefined;
    const n = numericAmount(x[key]);
    if (n === undefined || n > 500000) return undefined;
    return n;
  };

  if (x.minBudget !== null && x.minBudget !== undefined && parseBudget("minBudget") === undefined) return;
  if (x.maxBudget !== null && x.maxBudget !== undefined && parseBudget("maxBudget") === undefined) return;

  const req = x.requirements;
  let r: Record<string, unknown> = {};
  if (req === null || req === undefined) {
    r = {};
  } else if (typeof req !== "object" || Array.isArray(req)) {
    return;
  } else {
    r = req as Record<string, unknown>;
  }
  if (r.ram !== null && r.ram !== undefined && !["8GB", "16GB", "32GB", "64GB"].includes(r.ram as string)) return;
  if (r.portability !== null && r.portability !== undefined && r.portability !== "high") return;

  const preferences = Array.isArray(x.preferences)
    ? x.preferences
    : x.preferences === null || x.preferences === undefined
      ? []
      : undefined;
  if (!preferences || !preferences.every((p) => ["portability", "battery", "display", "value"].includes(p as string))) {
    return;
  }

  const sortPreference =
    x.sortPreference === null || x.sortPreference === undefined
      ? "value"
      : x.sortPreference;
  if (!["value", "rating", "portability"].includes(sortPreference as string)) return;

  const confidence =
    typeof x.confidence === "number" && x.confidence >= 0 && x.confidence <= 1 ? x.confidence : undefined;
  if (confidence === undefined) return;

  if (typeof x.clarificationNeeded !== "boolean") return;

  const minBudget = parseBudget("minBudget");
  const maxBudget = parseBudget("maxBudget");
  if (minBudget && maxBudget && minBudget > maxBudget) return;

  return {
    category,
    useCase: useCase as string | undefined,
    minBudget,
    maxBudget,
    requirements: {
      ...(r.ram ? { ram: r.ram as string } : {}),
      ...(r.portability ? { portability: "high" as const } : {}),
    },
    preferences: preferences as string[],
    sortPreference: sortPreference as BuyerIntent["sortPreference"],
    confidence,
    clarificationNeeded: x.clarificationNeeded,
  };
}
