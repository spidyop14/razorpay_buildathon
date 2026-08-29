import { catalog, type Category, type Product } from "./catalog";

export type Intent = {
  raw: string;
  category?: Category;
  minBudget?: number;
  maxBudget?: number;
  requirements?: { ram?: string; portability?: "high" };
  preferences?: string[];
  sortPreference?: "value" | "rating" | "portability";
  useCase?: string;
  setup?: boolean;
  confidence?: number;
  clarificationNeeded?: boolean;
};

export type Recommendation = {
  product: Product;
  matchScore: number;
  reasons: string[];
  matchedRequirements: string[];
  tradeoffs: string[];
};

const CATEGORIES: Category[] = [
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

const CATEGORY_ALIASES: Record<string, Category> = {
  laptop: "laptop",
  notebooks: "laptop",
  notebook: "laptop",
  ultrabook: "laptop",
  "coding-laptop": "laptop",
  "coding laptop": "laptop",
  "gaming-laptop": "gaming-laptop",
  "gaming laptop": "gaming-laptop",
  gaming_laptop: "gaming-laptop",
  gaminglaptop: "gaming-laptop",
  gaming: "gaming-laptop",
  "gaming-setup": "gaming-laptop",
  "gaming setup": "gaming-laptop",
  headphones: "headphones",
  headphone: "headphones",
  headset: "headphones",
  earphones: "headphones",
  "travel-headphones": "headphones",
  "travel headphones": "headphones",
  monitor: "monitor",
  display: "monitor",
  keyboard: "keyboard",
  mouse: "mouse",
  "laptop-bag": "laptop-bag",
  "cooling-pad": "cooling-pad",
  webcam: "webcam",
  "usb-hub": "usb-hub",
};

export function normalizeCategory(value: unknown): Category | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase();
  if ((CATEGORIES as string[]).includes(key)) return key as Category;
  return CATEGORY_ALIASES[key];
}

export function matchesCatalogCategory(product: Product, intent: Intent): boolean {
  const wanted = normalizeCategory(intent.category);
  // Parent type "laptop" + gaming use case must resolve to gaming laptops, not office notebooks.
  if (intent.useCase === "gaming" && (wanted === "laptop" || wanted === "gaming-laptop")) {
    return product.category === "gaming-laptop";
  }
  if (!wanted) return true;
  return product.category === wanted;
}

export function numericAmount(value: unknown): number | undefined {
  if (value == null || value === "") return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }
  if (typeof value === "string") {
    const cleaned = value.trim().toLowerCase().replace(/[₹rs.,\s]/g, "");
    const k = cleaned.endsWith("k");
    const n = Number(k ? cleaned.slice(0, -1) : cleaned);
    if (!Number.isFinite(n) || n < 0) return undefined;
    return k ? n * 1000 : n;
  }
  return undefined;
}

export function normalizeMaxBudget(intent: Intent): number | undefined {
  let budget = numericAmount(intent.maxBudget);
  if (budget == null || budget <= 0) return undefined;
  // LLMs sometimes emit 80 for "₹80K". Expand only when the query used K-shorthand.
  if (budget < 1000 && intent.raw && /\d[\d,]*\s*k\b/i.test(intent.raw)) {
    budget *= 1000;
  }
  return budget;
}

function inStock(product: Product): boolean {
  return Number(product.stock) > 0;
}

function matchesRequirements(product: Product, intent: Intent): boolean {
  const requirements = intent.requirements ?? {};
  if (requirements.ram) {
    const productRam = product.specifications.ram;
    // Headphones and accessories have no RAM field — do not reject them.
    if (productRam && productRam !== requirements.ram) return false;
  }
  return true;
}

const parseBudget = (input: string) => {
  const match = input
    .toLowerCase()
    .match(/(?:under|below|budget(?: of)?|less than)\s*(?:₹|rs\.?\s*)?\s*(\d+(?:[,.]\d+)?\s*k?)/);
  if (!match) return undefined;
  const n = match[1].replace(/[\s,]/g, "");
  return n.endsWith("k") ? Number(n.slice(0, -1)) * 1000 : Number(n);
};

export function parseBuyerRequest(raw: string): Intent {
  const text = raw.toLowerCase();
  let category: Category | undefined;
  if (/gaming setup|build.*setup/.test(text)) category = "gaming-laptop";
  else if (/gaming laptop/.test(text)) category = "gaming-laptop";
  else if (/laptop/.test(text)) category = "laptop";
  else if (/headphone/.test(text)) category = "headphones";
  else if (/keyboard/.test(text)) category = "keyboard";
  else if (/monitor|display/.test(text)) category = "monitor";
  else if (/mouse/.test(text)) category = "mouse";
  const ram = text.match(/(8|16|32|64)\s*gb\s*(?:ram)?/);
  const useCase = ["coding", "programming", "gaming", "college", "productivity", "travel"].find((x) =>
    text.includes(x)
  );
  const portable = /lightweight|portable|light\b/.test(text);
  return {
    raw,
    category,
    maxBudget: parseBudget(text),
    requirements: {
      ...(ram ? { ram: `${ram[1]}GB` } : {}),
      ...(portable ? { portability: "high" as const } : {}),
    },
    preferences: portable ? ["portability"] : [],
    sortPreference: portable ? "portability" : "value",
    useCase: useCase === "programming" ? "coding" : useCase,
    setup: /setup/.test(text),
    clarificationNeeded: !category,
  };
}

function recommendation(product: Product, intent: Intent): Recommendation {
  const requirements = intent.requirements ?? {};
  const budget = normalizeMaxBudget(intent);
  let score = 40;
  const reasons: string[] = [];
  const matched: string[] = [];
  const tradeoffs: string[] = [];
  if (budget) {
    const ratio = product.price / budget;
    if (ratio <= 1) {
      score += 22;
      reasons.push(`Within your ₹${budget.toLocaleString("en-IN")} budget`);
      matched.push("budget");
      if (ratio > 0.85) score += 3;
    } else tradeoffs.push("Close to your stated budget");
  }
  if (requirements.ram) {
    if (product.specifications.ram === requirements.ram) {
      score += 20;
      reasons.push(`Meets the ${requirements.ram} RAM requirement`);
      matched.push("ram");
    } else if (product.specifications.ram) {
      tradeoffs.push(`${product.specifications.ram} RAM instead of ${requirements.ram}`);
    }
  }
  if (intent.useCase && product.useCases.includes(intent.useCase)) {
    score += 16;
    reasons.push(`Strong fit for ${intent.useCase}`);
    matched.push("use_case");
  }
  const ai =
    intent.useCase === "gaming"
      ? product.aiAttributes.gamingScore
      : intent.useCase === "coding"
        ? product.aiAttributes.codingScore
        : product.aiAttributes.valueScore;
  score += Math.round((ai || product.aiAttributes.valueScore) * 0.13);
  score += Math.round(product.rating * 2);
  if (inStock(product)) {
    score += 3;
    reasons.push("Currently in stock");
    matched.push("stock");
  }
  if (!tradeoffs.length && product.category === "laptop" && !product.specifications.gpu) {
    tradeoffs.push("No dedicated GPU");
  }
  return {
    product,
    matchScore: Math.min(99, score),
    reasons,
    matchedRequirements: matched,
    tradeoffs,
  };
}

export function searchCatalog(intent: Intent) {
  const budget = normalizeMaxBudget(intent);
  return catalog
    .filter((p) => matchesCatalogCategory(p, intent))
    .filter((p) => inStock(p))
    .filter((p) => !budget || Number(p.price) <= budget)
    .filter((p) => matchesRequirements(p, intent))
    .map((p) => recommendation(p, intent))
    .sort((a, b) => b.matchScore - a.matchScore);
}

export function shouldShowNoMatch(
  step: number,
  intent: Intent | undefined,
  results: Recommendation[]
) {
  return step === 5 && Boolean(intent) && !intent?.clarificationNeeded && results.length === 0;
}

export function getRelatedProducts(product: Product) {
  return product.relatedProductIds
    .map((id) => catalog.find((p) => p.id === id))
    .filter((p): p is Product => Boolean(p && p.stock > 0));
}

export function buildOfferPreview(product: Product, extras: Product[]) {
  const subtotal = [product, ...extras].reduce((sum, p) => sum + p.price, 0);
  const discount = extras.length
    ? Math.min(650, Math.round(extras.reduce((s, p) => s + p.price, 0) * 0.12))
    : 0;
  return { subtotal, discount, finalAmount: subtotal - discount, items: [product, ...extras] };
}
