import test from "node:test";
import assert from "node:assert/strict";
import {
  parseBuyerRequest,
  searchCatalog,
  getRelatedProducts,
  buildOfferPreview,
  shouldShowNoMatch,
  normalizeCategory,
} from "./buyer.ts";

test("parses laptop, budget, RAM and coding", () => {
  const x = parseBuyerRequest("I need a coding laptop under ₹60,000 with 16GB RAM");
  assert.equal(x.category, "laptop");
  assert.equal(x.maxBudget, 60000);
  assert.equal(x.requirements.ram, "16GB");
  assert.equal(x.useCase, "coding");
});
test("parses 60k", () => assert.equal(parseBuyerRequest("gaming laptop under 60k").maxBudget, 60000));
test("parses spaced INR shorthand", () =>
  assert.equal(parseBuyerRequest("monitor under ₹60 K").maxBudget, 60000));
test("parses a RAM requirement independently", () =>
  assert.equal(parseBuyerRequest("laptop with 16GB RAM").requirements.ram, "16GB"));
test("parses gaming setup intent", () =>
  assert.equal(parseBuyerRequest("build me a gaming setup under 80000").category, "gaming-laptop"));
test("searches, filters, ranks and excludes stock", () => {
  const r = searchCatalog(parseBuyerRequest("coding laptop under 60000 with 16GB RAM"));
  assert.ok(r.length > 0);
  assert.ok(r.every((x) => x.product.price <= 60000 && x.product.stock > 0));
  assert.ok(r[0].matchScore >= r.at(-1).matchScore);
});
test("returns related products and calculates offer", () => {
  const product = searchCatalog(parseBuyerRequest("coding laptop under 60000 with 16GB RAM"))[0].product;
  const extras = getRelatedProducts(product);
  assert.ok(extras.length > 0);
  const offer = buildOfferPreview(product, [extras[0]]);
  assert.ok(offer.finalAmount < offer.subtotal);
});
test("has a no-match scenario", () =>
  assert.equal(searchCatalog(parseBuyerRequest("laptop under 10000 with 32GB RAM")).length, 0));
test("filters out of budget products", () =>
  assert.ok(searchCatalog(parseBuyerRequest("headphones under 4000")).every((x) => x.product.price <= 4000)));
test("filters products with no stock", () =>
  assert.ok(searchCatalog(parseBuyerRequest("headphones under 5000")).every((x) => x.product.stock > 0)));
test("recommendation score is a bounded percentage", () => {
  const x = searchCatalog(parseBuyerRequest("coding laptop under 60000 with 16GB RAM"))[0];
  assert.ok(x.matchScore >= 0 && x.matchScore <= 100);
  assert.ok(x.reasons.length > 0);
});
test("recommendations provide explainable matched requirements", () => {
  const x = searchCatalog(parseBuyerRequest("coding laptop under 60000 with 16GB RAM"))[0];
  assert.ok(x.matchedRequirements.includes("budget"));
  assert.ok(x.matchedRequirements.includes("ram"));
});

test("gaming query returns game-001 and game-002", () => {
  const ids = searchCatalog(parseBuyerRequest("Gaming setup under ₹80K")).map((x) => x.product.id);
  assert.ok(ids.includes("game-001"));
  assert.ok(ids.includes("game-002"));
  assert.ok(ids.every((id) => id.startsWith("game-")));
});

test("coding query returns lap-001 and lap-002", () => {
  const ids = searchCatalog(parseBuyerRequest("Coding laptop under ₹60K")).map((x) => x.product.id);
  assert.ok(ids.includes("lap-001"));
  assert.ok(ids.includes("lap-002"));
});

test("travel query returns head-001 and head-002", () => {
  const ids = searchCatalog(parseBuyerRequest("Travel headphones under ₹5K")).map((x) => x.product.id);
  assert.ok(ids.includes("head-001"));
  assert.ok(ids.includes("head-002"));
});

test("missing requirements does not throw", () => {
  const results = searchCatalog({
    raw: "Gaming setup under ₹80K",
    category: "gaming-laptop",
    maxBudget: 80000,
    useCase: "gaming",
  });
  assert.ok(results.some((x) => x.product.id === "game-001"));
});

test("empty requirements object does not throw", () => {
  const results = searchCatalog({
    raw: "Gaming setup under ₹80K",
    category: "gaming-laptop",
    maxBudget: 80000,
    requirements: {},
    useCase: "gaming",
  });
  assert.ok(results.some((x) => x.product.id === "game-002"));
});

test("budget filtering compares numeric rupees", () => {
  const gaming = searchCatalog({
    raw: "Gaming setup under ₹80K",
    category: "gaming-laptop",
    maxBudget: 80000,
    requirements: {},
    useCase: "gaming",
  });
  assert.ok(gaming.every((x) => x.product.price <= 80000));
  assert.ok(gaming.some((x) => x.product.price === 74999));
  assert.ok(gaming.some((x) => x.product.price === 79999));
  const coding = searchCatalog(parseBuyerRequest("Coding laptop under ₹60K"));
  assert.ok(coding.every((x) => x.product.price <= 60000));
  const audio = searchCatalog(parseBuyerRequest("Travel headphones under ₹5K"));
  assert.ok(audio.every((x) => x.product.price <= 5000));
});

test("inventory filtering keeps in-stock demo products", () => {
  const ids = new Set(
    searchCatalog({ raw: "all", maxBudget: 500000, requirements: {} }).map((x) => x.product.id)
  );
  for (const id of ["game-001", "game-002", "lap-001", "lap-002", "head-001", "head-002"]) {
    assert.ok(ids.has(id), id);
  }
  assert.equal(ids.has("lap-005"), false);
  assert.equal(ids.has("head-003"), false);
});

test("category aliases normalize to catalog categories", () => {
  assert.equal(normalizeCategory("gaming"), "gaming-laptop");
  assert.equal(normalizeCategory("gaming-laptop"), "gaming-laptop");
  assert.equal(normalizeCategory("coding-laptop"), "laptop");
  assert.equal(normalizeCategory("travel-headphones"), "headphones");
});

test("Gemini parent category laptop + gaming useCase matches gaming products only", () => {
  const results = searchCatalog({
    raw: "Gaming setup under ₹80K",
    category: "laptop",
    maxBudget: 80000,
    requirements: {},
    useCase: "gaming",
  });
  const ids = results.map((x) => x.product.id);
  assert.ok(ids.includes("game-001"));
  assert.ok(ids.includes("game-002"));
  assert.ok(results.every((x) => x.product.category === "gaming-laptop"));
});

test("useCase is not a strict catalog field filter for travel headphones", () => {
  const results = searchCatalog({
    raw: "Travel headphones under ₹5K",
    category: "headphones",
    maxBudget: 5000,
    requirements: {},
    useCase: "travel",
  });
  const ids = results.map((x) => x.product.id);
  assert.ok(ids.includes("head-001"));
  assert.ok(ids.includes("head-002"));
});

test("RAM requirement is ignored when the product has no RAM specification", () => {
  const results = searchCatalog({
    raw: "Travel headphones under ₹5K",
    category: "headphones",
    maxBudget: 5000,
    requirements: { ram: "16GB" },
    useCase: "travel",
  });
  assert.ok(results.some((x) => x.product.id === "head-002"));
});

test("UI empty state is only used when results.length === 0", () => {
  const matches = searchCatalog(parseBuyerRequest("Gaming setup under ₹80K"));
  assert.equal(shouldShowNoMatch(5, parseBuyerRequest("Gaming setup under ₹80K"), matches), false);
  assert.equal(shouldShowNoMatch(5, parseBuyerRequest("Gaming setup under ₹80K"), []), true);
  assert.equal(shouldShowNoMatch(5, undefined, []), false);
});

test("expands K-shorthand budgets when the model returns 80 for ₹80K", () => {
  const results = searchCatalog({
    raw: "Gaming setup under ₹80K",
    category: "gaming-laptop",
    maxBudget: 80,
    requirements: {},
    useCase: "gaming",
  });
  assert.ok(results.some((x) => x.product.id === "game-001"));
});
