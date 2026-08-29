"use client";
/* eslint-disable @next/next/no-img-element */
import { Check, CircleAlert, LoaderCircle, PackageCheck, Search, Sparkles } from "lucide-react";
import { useMemo, useState } from "react";
import { buildOfferPreview, getRelatedProducts, parseBuyerRequest, searchCatalog, shouldShowNoMatch, type Intent, type Recommendation } from "../lib/buyer";
import { getProduct, type Product } from "../lib/catalog";
import { evaluateTransaction } from "../lib/policy/policy-engine";
import { usePolicies } from "./policy-provider";
import type { PolicyEvaluation } from "../lib/policy/types";
import { RazorpayPayment } from "./razorpay-payment";

const steps = [
  "Understanding request",
  "Extracting buyer intent",
  "Searching merchant catalog",
  "Ranking verified matches",
  "Checking inventory",
  "Preparing recommendations",
];

const money = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const photo = (category: string) =>
  category.includes("laptop")
    ? "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=700&q=80"
    : category === "headphones"
    ? "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80"
    : "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=700&q=80";

function PolicyGate({
  evaluation,
  onApprove,
}: {
  evaluation: PolicyEvaluation;
  onApprove: () => void;
}) {
  const blocked = evaluation.state === "POLICY_BLOCKED";
  const approved = evaluation.state === "APPROVED";

  return (
    <section
      className={
        blocked
          ? "rounded-xl border border-rose-200 bg-rose-50 p-5"
          : "rounded-xl border border-blue-100 bg-blue-50/50 p-5"
      }
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
            Policy check
          </p>
          <h3 className={blocked ? "mt-1 font-bold text-rose-800" : "mt-1 font-bold"}>
            {blocked
              ? "Blocked by policy"
              : approved
              ? "Transaction approved"
              : "Approval required"}
          </h3>
        </div>
        <span
          className={
            blocked
              ? "rounded-full bg-rose-100 px-3 py-1 text-xs font-semibold text-rose-700"
              : approved
              ? "rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700"
              : "rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
          }
        >
          {blocked ? "Blocked" : approved ? "Ready for payment" : "Approval required"}
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {evaluation.checks.map((c) => (
          <p
            key={c.policy}
            className={
              c.status === "blocked"
                ? "text-sm text-rose-700"
                : c.status === "pending"
                ? "text-sm text-amber-700"
                : "text-sm text-emerald-700"
            }
          >
            {c.status === "blocked" ? "✕" : c.status === "pending" ? "⏳" : "✓"} {c.message}
          </p>
        ))}
      </div>

      {blocked ? (
        <p className="mt-4 text-sm text-rose-800">
          Agent recommendation cannot proceed. The LLM cannot override this deterministic policy decision.
        </p>
      ) : approved ? (
        <p className="mt-4 text-sm text-emerald-700">
          Ready for payment. Proceed with Razorpay checkout below.
        </p>
      ) : (
        <button
          onClick={onApprove}
          className="mt-5 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition"
        >
          Approve transaction
        </button>
      )}
    </section>
  );
}

export function BuyerFlow() {
  const {
    policies,
    record,
    session,
    selectProduct,
    setSessionExtras,
    setSessionStep,
    setSessionUserApproved,
    completeDiscovery,
    startNewSession,
    resetDemo,
    setTransactionPhase,
  } = usePolicies();

  const [request, setRequest] = useState(session.buyerQuery || "");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<"ai" | "fallback">("fallback");
  const [history, setHistory] = useState<string[]>([]);
  const [explanation, setExplanation] = useState("");
  const [ready, setReady] = useState(false);

  // Directly derived from session for full refresh safety & zero render desync
  const selected = session.selectedProduct;
  const userApproved = session.userApproved;
  const step = session.step;
  const intent = session.intent;
  const extras = useMemo(
    () => (session.extras || []).map(getProduct).filter((p): p is Product => Boolean(p)),
    [session.extras]
  );
  const results = useMemo(
    () => (intent ? searchCatalog(intent) : []),
    [intent]
  );

  const related = useMemo(() => (selected ? getRelatedProducts(selected) : []), [selected]);
  const offer = selected ? buildOfferPreview(selected, extras) : undefined;
  const rec = results.find((x) => x.product.id === selected?.id);

  const evaluation =
    selected && offer
      ? evaluateTransaction(
          {
            productId: selected.id,
            basePrice: offer.subtotal,
            proposedPrice: offer.finalAmount,
            merchantCost: offer.items.reduce((s, p) => s + p.price - p.margin, 0),
            environment: "test",
            paymentAttempt: 0,
            userApproval: Boolean(userApproved),
          },
          policies
        )
      : undefined;

  async function discover() {
    setError("");
    setNotice("");
    setExplanation("");
    setReady(false);
    startNewSession();

    if (!request.trim()) return setError("Tell the buyer agent what you are looking for.");
    record({ actor: "AI Buyer", action: "Buyer request received", amount: "—", policy: "Intent is untrusted until catalog validation", result: "Pending" });
    setSessionStep(0);

    try {
      const res = await fetch("/api/agent/understand", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: request, history }),
      });
      const data = (await res.json()) as {
        intent?: Intent;
        mode?: "ai" | "fallback";
        notice?: string;
      };
      if (!res.ok || !data.intent) throw new Error();
      setMode(data.mode || "fallback");
      setNotice(data.notice || "");
      setHistory((x) => [...x, request].slice(-4));
      completeDiscovery(data.intent, request, data.intent.clarificationNeeded ? 1 : 5);
      record({ actor: "AI Buyer", action: "Buyer intent extracted", amount: data.intent.maxBudget ? money(data.intent.maxBudget) : "—", policy: data.mode === "ai" ? "Structured AI output" : "Deterministic fallback", result: "Allowed" });
    } catch {
      const fallback = parseBuyerRequest(request);
      setMode("fallback");
      setNotice(
        "AI understanding is temporarily unavailable. We used the local commerce parser, so your catalog results are still available."
      );
      completeDiscovery(fallback, request, 5);
      record({ actor: "AI Buyer", action: "Buyer intent extracted", amount: fallback.maxBudget ? money(fallback.maxBudget) : "—", policy: "Deterministic fallback", result: "Allowed" });
    }
  }

  async function select(r: Recommendation) {
    setExplanation("");
    selectProduct(r.product, intent);

    const check = evaluateTransaction(
      {
        productId: r.product.id,
        basePrice: r.product.price,
        proposedPrice: r.product.price,
        merchantCost: r.product.price - r.product.margin,
        environment: "test",
        paymentAttempt: 0,
        userApproval: false,
      },
      policies
    );

    record({
      actor: "Policy Engine",
      action: check.allowed ? "Transaction evaluated" : "Transaction blocked",
      amount: money(r.product.price),
      policy: check.blocks[0]?.policy || "All checks",
      result: check.state === "POLICY_BLOCKED" ? "Blocked" : "Pending",
    });
    setTransactionPhase("POLICY_CHECKED");

    if (!intent) return;
    try {
      const res = await fetch("/api/agent/explain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: request, intent, recommendation: r }),
      });
      const data = (await res.json()) as { explanation?: string };
      if (data.explanation) setExplanation(data.explanation);
    } catch {}
  }

  return (
    <div className="space-y-7">
      {!session.selectedProduct && <section className="rounded-xl border border-blue-100 bg-blue-50/60 p-4 text-sm text-blue-900"><p className="font-semibold">Recommended demo</p><p className="mt-1 text-blue-800">Gaming setup under ₹80K → select a product → review a Merchant Agent offer → approve → policy-controlled Razorpay Test Mode payment → Audit Trail.</p></section>}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_.75fr]">
        <section className="rounded-xl border border-zinc-200 bg-white p-5 md:p-7">
          <label htmlFor="request" className="text-sm font-semibold">
            What are you looking for?
          </label>
          <textarea
            id="request"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            className="mt-3 min-h-32 w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm outline-none focus:border-blue-400 focus:ring-3 focus:ring-blue-50"
            placeholder="Find me a coding laptop under ₹60,000 with 16GB RAM"
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              "Coding laptop under ₹60K",
              "Gaming setup under ₹80K",
              "Travel headphones under ₹5K",
            ].map((x) => (
              <button
                onClick={() => setRequest(x)}
                key={x}
                className="rounded-full border border-zinc-200 px-3 py-1.5 text-xs text-zinc-600 hover:border-blue-200 hover:text-blue-700"
              >
                {x}
              </button>
            ))}
          </div>
          {error && (
            <p className="mt-4 flex gap-2 text-sm text-rose-600">
              <CircleAlert size={16} />
              {error}
            </p>
          )}
          <div className="mt-6 flex justify-end">
            {session.selectedProduct && <button onClick={() => { resetDemo(); setRequest(""); setError(""); setNotice(""); setExplanation(""); }} className="mr-auto rounded-lg border border-zinc-200 px-4 py-2.5 text-sm font-semibold text-zinc-600 hover:bg-zinc-50">Reset demo</button>}
            <button
              onClick={discover}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Search size={16} />
              Start discovery
            </button>
          </div>
        </section>
        <aside className="rounded-xl border border-zinc-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-blue-600" />
            <h3 className="font-semibold">Agent Activity</h3>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            Demo Catalog · {mode === "ai" ? "Gemini AI Agent" : "Gemini unavailable · Deterministic fallback"}
          </p>
          <div className="mt-5 space-y-3">
            {steps.map((label, index) => (
              <div className="flex items-center gap-3" key={label}>
                {step >= index ? (
                  <span className="grid size-5 place-items-center rounded-full bg-emerald-500 text-white">
                    <Check size={12} />
                  </span>
                ) : step === index - 1 ? (
                  <LoaderCircle className="animate-spin text-blue-600" size={18} />
                ) : (
                  <span className="size-5 rounded-full border border-zinc-200" />
                )}
                <span className={step >= index ? "text-sm text-zinc-700" : "text-sm text-zinc-400"}>
                  {label}
                </span>
              </div>
            ))}
            {intent && (
              <p className="border-t border-zinc-100 pt-4 text-xs font-semibold text-emerald-600">
                {results.length
                  ? `${results.length} verified matches · Discovery complete`
                  : intent.clarificationNeeded
                  ? "Clarification needed"
                  : ""}
              </p>
            )}
          </div>
        </aside>
      </div>

      {notice && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {notice}
        </p>
      )}

      {evaluation && (
        <PolicyGate
          evaluation={evaluation}
          onApprove={() => {
            setSessionUserApproved(true);
            record({
              actor: "User",
              action: "Transaction approved",
              amount: money(offer?.finalAmount || 0),
              policy: "All checks",
              result: "Allowed",
            });
          }}
        />
      )}

      {evaluation?.state === "APPROVED" && selected && (
        <RazorpayPayment
          key={`${selected.id}-${extras.map((x) => x.id).join(",")}`}
          productId={selected.id}
          extraIds={extras.map((x) => x.id)}
          policies={policies}
          idempotencyKey={`${session.sessionId}:${session.revision}`}
          onPhase={setTransactionPhase}
          onEvent={(action, result, amount) =>
            record({ actor: "Razorpay", action, amount, policy: "Test Mode", result })
          }
        />
      )}

      {intent?.clarificationNeeded && (
        <section className="rounded-xl border border-blue-100 bg-blue-50 p-6">
          <h3 className="font-semibold">Tell me a little more about what you&apos;re looking for.</h3>
          <p className="mt-1 text-sm text-zinc-600">
            I can search the verified catalog once I know the product type.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {[
              "What are you shopping for?",
              "What is your approximate budget?",
              "What will you use it for?",
            ].map((x) => (
              <span className="rounded-full bg-white px-3 py-1.5 text-xs text-zinc-600" key={x}>
                {x}
              </span>
            ))}
          </div>
        </section>
      )}

      {shouldShowNoMatch(step, intent, results) && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-6">
          <h3 className="font-semibold">No exact match found</h3>
          <p className="mt-1 text-sm text-zinc-600">
            Your requirements are stricter than the current catalog. Try increasing the budget or removing a requirement.
          </p>
        </section>
      )}

      {results.length > 0 && !selected && (
        <section>
          <div className="mb-4">
            <h3 className="text-xl font-bold">Top recommendations</h3>
            <p className="mt-1 text-sm text-zinc-500">
              Verified catalog matches, ranked deterministically from the structured intent.
            </p>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            {results.slice(0, 3).map((r) => (
              <article
                key={r.product.id}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
              >
                <div className="relative h-36 overflow-hidden bg-zinc-100">
                  <img src={photo(r.product.category)} alt="" className="h-full w-full object-cover" />
                  <span className="absolute right-3 top-3 rounded-full bg-zinc-900 px-2.5 py-1 text-xs font-bold text-white">
                    {r.matchScore}% AI MATCH
                  </span>
                </div>
                <div className="p-5">
                  <p className="text-xs font-semibold text-zinc-500">{r.product.brand}</p>
                  <h4 className="mt-1 font-semibold">{r.product.name}</h4>
                  <div className="mt-3 flex justify-between">
                    <p className="text-xl font-bold">{money(r.product.price)}</p>
                    <span className="text-xs text-amber-600">
                      ★ {r.product.rating} ({r.product.reviewCount})
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {Object.values(r.product.specifications)
                      .slice(0, 3)
                      .map((x) => (
                        <span key={x} className="rounded bg-zinc-100 px-2 py-1 text-[11px] text-zinc-600">
                          {x}
                        </span>
                      ))}
                  </div>
                  <p className="mt-4 text-xs font-semibold">Why this matches</p>
                  <ul className="mt-2 space-y-1">
                    {r.reasons.slice(0, 3).map((x) => (
                      <li key={x} className="flex gap-1.5 text-xs text-zinc-500">
                        <Check size={13} className="shrink-0 text-emerald-600" />
                        {x}
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={() => select(r)}
                    className="mt-5 w-full rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800"
                  >
                    Select
                  </button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {selected && offer && (
        <section className="grid gap-6 xl:grid-cols-[1.35fr_.65fr]">
          <div className="space-y-6">
            <article className="rounded-xl border border-zinc-200 bg-white p-6">
              <div className="flex gap-5">
                <img
                  src={photo(selected.category)}
                  alt=""
                  className="size-22 rounded-lg object-cover"
                />
                <div>
                  <p className="text-xs font-semibold text-blue-600">SELECTED BY AGENT</p>
                  <h3 className="mt-1 text-xl font-bold">{selected.name}</h3>
                  <p className="mt-1 text-sm text-zinc-500">
                    {selected.brand} · ★ {selected.rating} · {selected.stock} units in stock
                  </p>
                  <p className="mt-3 text-xl font-bold">{money(selected.price)}</p>
                </div>
              </div>
              <div className="mt-6 grid gap-4 border-t border-zinc-100 pt-5 sm:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    AI recommendation
                  </p>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">
                    {explanation ||
                      `Best overall fit. It satisfies ${
                        rec?.matchedRequirements.length || 3
                      } explicit requirements. ${rec?.tradeoffs[0] || ""}`}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
                    Verified specifications
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {Object.values(selected.specifications).map((v) => (
                      <span key={v} className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                        {v}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </article>

            <article className="rounded-xl border border-zinc-200 bg-white p-6">
              <h3 className="font-semibold">Complete the setup</h3>
              <p className="mt-1 text-sm text-zinc-500">Frequently paired with this product.</p>
              <div className="mt-4 divide-y divide-zinc-100">
                {related.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-zinc-500">{money(p.price)}</p>
                    </div>
                    <button
                      onClick={() => {
                        const nextIds = extras.some((v) => v.id === p.id)
                          ? extras.filter((v) => v.id !== p.id).map((v) => v.id)
                          : [...extras.map((v) => v.id), p.id];
                        setSessionExtras(nextIds);
                      }}
                      className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-semibold text-zinc-600"
                    >
                      {extras.some((x) => x.id === p.id) ? "Added" : "Add to offer"}
                    </button>
                  </div>
                ))}
              </div>
              <button
                onClick={() => {
                  startNewSession();
                }}
                className="mt-4 text-sm font-semibold text-zinc-500"
              >
                Choose another product
              </button>
            </article>
          </div>

          <aside className="h-fit rounded-xl border border-blue-100 bg-blue-50/50 p-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              AI-generated offer preview
            </p>
            <h3 className="mt-2 text-lg font-bold">Your selection</h3>
            <div className="mt-5 space-y-3">
              {offer.items.map((p) => (
                <div key={p.id} className="flex justify-between text-sm">
                  <span>{p.name}</span>
                  <b>{money(p.price)}</b>
                </div>
              ))}
            </div>
            <div className="mt-5 space-y-2 border-y border-blue-100 py-4 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>{money(offer.subtotal)}</span>
              </div>
              {offer.discount > 0 && (
                <div className="flex justify-between text-emerald-700">
                  <span>Bundle saving</span>
                  <span>−{money(offer.discount)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 text-base font-bold">
                <span>Final amount</span>
                <span>{money(offer.finalAmount)}</span>
              </div>
            </div>
            <div className="mt-5 rounded-lg bg-white p-3 text-xs leading-5 text-zinc-600">
              <b className="block text-zinc-800">Ready for approval</b>
              No payment is processed in this phase.
            </div>
            <button
              onClick={() => setReady(true)}
              className="mt-5 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
            >
              {ready ? (
                <span className="flex items-center justify-center gap-2">
                  <PackageCheck size={16} />
                  Prepared for approval
                </span>
              ) : (
                "Continue to approval"
              )}
            </button>
          </aside>
        </section>
      )}

      <section className="rounded-xl border border-zinc-200 bg-white p-6">
        <h3 className="font-semibold">How it works</h3>
        <div className="mt-5 grid gap-4 sm:grid-cols-5">
          {["Understand", "Discover", "Evaluate", "Approve", "Transact"].map((x, i) => (
            <div key={x}>
              <span className="grid size-8 place-items-center rounded-lg bg-zinc-100 text-xs font-bold text-zinc-600">
                0{i + 1}
              </span>
              <p className="mt-2 text-sm font-semibold">{x}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
