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
const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");
const LAPTOP_IMAGES = [
  "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?auto=format&fit=crop&w=700&q=80",
  "https://images.unsplash.com/photo-1593642632823-8f785ba67e45?auto=format&fit=crop&w=700&q=80",
  "https://images.unsplash.com/photo-1603302576837-37561b2e2302?auto=format&fit=crop&w=700&q=80",
  "https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?auto=format&fit=crop&w=700&q=80",
];

const photo = (category: string, id?: string) => {
  if (category.includes("laptop")) {
    if (!id) return LAPTOP_IMAGES[0];
    const index = Array.from(id).reduce((acc, char) => acc + char.charCodeAt(0), 0) % LAPTOP_IMAGES.length;
    return LAPTOP_IMAGES[index];
  }
  return category === "headphones"
    ? "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=700&q=80"
    : "https://images.unsplash.com/photo-1527864550417-7fd91fc51a46?auto=format&fit=crop&w=700&q=80";
};

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
      {!session.selectedProduct && (
        <section className="rounded-xl border border-blue-200/50 bg-blue-50/40 p-5 text-sm text-blue-900 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex-1 space-y-1.5">
              <p className="font-semibold text-blue-800">Recommended success demo (Under ₹50K Limit)</p>
              <p className="text-blue-700/90 leading-relaxed">Coding laptop under ₹50K → select a product → review a Merchant Agent offer → approve → policy-controlled Razorpay Test Mode payment → Audit Trail.</p>
            </div>
            <div className="flex-1 space-y-1.5 border-t border-blue-100 pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
              <p className="font-semibold text-rose-700">Failure demo (Over Limit)</p>
              <p className="text-rose-700/80 leading-relaxed">Try &quot;Gaming setup under ₹80K&quot; to test Razorpay Test Mode rejection handling.</p>
            </div>
          </div>
        </section>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.5fr_.75fr]">
        <section className="flex flex-col justify-between rounded-2xl border border-zinc-200 bg-white p-6 md:p-8 shadow-sm">
          <div>
            <label htmlFor="request" className="text-[15px] font-semibold text-zinc-900">
              What are you looking for?
            </label>
            <textarea
              id="request"
              value={request}
              onChange={(e) => setRequest(e.target.value)}
              className="mt-4 min-h-[140px] w-full resize-none rounded-xl border border-zinc-200 bg-zinc-50/50 p-4 text-[15px] leading-relaxed text-zinc-800 outline-none transition-all placeholder:text-zinc-400 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-50"
              placeholder="e.g. Find me a coding laptop under ₹50,000 with 16GB RAM"
            />
            <div className="mt-5 flex flex-wrap gap-2.5">
              {[
                "Coding laptop under ₹50K",
                "Gaming setup under ₹80K",
                "Travel headphones under ₹5K",
              ].map((x) => (
                <button
                  onClick={() => setRequest(x)}
                  key={x}
                  className="rounded-lg border border-zinc-200 bg-white px-3.5 py-2 text-[13px] font-medium text-zinc-600 shadow-sm transition-all hover:border-blue-200 hover:text-blue-700 focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-50"
                >
                  {x}
                </button>
              ))}
            </div>
            {error && (
              <p className="mt-5 flex items-center gap-2 text-[13px] font-medium text-rose-600">
                <CircleAlert size={16} />
                {error}
              </p>
            )}
          </div>
          <div className="mt-8 flex items-center justify-between border-t border-zinc-100 pt-6">
            {session.selectedProduct ? (
              <button onClick={() => { resetDemo(); setRequest(""); setError(""); setNotice(""); setExplanation(""); }} className="rounded-lg px-4 py-2.5 text-[14px] font-semibold text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-800">
                Clear selection
              </button>
            ) : <div />}
            <button
              onClick={discover}
              disabled={step > -1 && step < 5}
              className="group relative flex items-center gap-2.5 overflow-hidden rounded-xl bg-blue-600 px-6 py-3 text-[14px] font-semibold text-white shadow-sm transition-all hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed"
            >
              {step > -1 && step < 5 ? (
                <>
                  <LoaderCircle size={18} className="animate-spin" />
                  Discovering...
                </>
              ) : (
                <>
                  <Search size={18} className="transition-transform group-hover:scale-110" />
                  Start discovery
                </>
              )}
            </button>
          </div>
        </section>
        <aside className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm flex flex-col">
          <div className="flex items-center gap-3 border-b border-zinc-100 pb-4">
            <div className="grid size-9 place-items-center rounded-lg bg-blue-50 text-blue-600">
              <Sparkles size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-zinc-900">Agent Activity</h3>
              <p className="text-[11px] font-medium text-zinc-500 uppercase tracking-wider mt-0.5">
                {mode === "ai" ? "Gemini AI Agent" : "Deterministic fallback"}
              </p>
            </div>
          </div>
          <div className="mt-6 flex-1 space-y-5">
            {steps.map((label, index) => {
              const isActive = step === index - 1;
              const isCompleted = step >= index;
              const isPending = step < index - 1;
              
              return (
                <div className="flex items-center gap-3.5 transition-opacity duration-300" key={label} style={{ opacity: isPending ? 0.5 : 1 }}>
                  {isCompleted ? (
                    <span className="grid size-6 place-items-center rounded-full bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-200">
                      <Check size={12} className="stroke-[3]" />
                    </span>
                  ) : isActive ? (
                    <span className="relative grid size-6 place-items-center">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-20"></span>
                      <LoaderCircle className="animate-spin text-blue-600" size={16} />
                    </span>
                  ) : (
                    <span className="size-6 rounded-full border-2 border-zinc-200 bg-zinc-50" />
                  )}
                  <span className={cx("text-[14px] font-medium transition-colors", isActive ? "text-blue-700" : isCompleted ? "text-zinc-900" : "text-zinc-500")}>
                    {label}
                  </span>
                </div>
              );
            })}
          </div>
          {intent && (
            <div className="mt-6 rounded-xl bg-emerald-50/50 p-4 border border-emerald-100/50">
              <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-700">
                <Check size={16} />
                {results.length
                  ? `${results.length} verified matches · Discovery complete`
                  : intent.clarificationNeeded
                  ? "Clarification needed"
                  : "No matches found"}
              </p>
            </div>
          )}
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
        <section className="mt-10">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-zinc-100 pb-5">
            <div>
              <h3 className="text-2xl font-bold text-zinc-900">Top recommendations</h3>
              <p className="mt-1.5 text-[15px] text-zinc-500">
                Verified catalog matches, ranked deterministically from the structured intent.
              </p>
            </div>
          </div>
          <div className="grid gap-6 lg:grid-cols-3">
            {results.slice(0, 3).map((r) => (
              <article
                key={r.product.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-zinc-200 bg-white transition-all duration-300 hover:-translate-y-1 hover:border-blue-200 hover:shadow-[0_8px_30px_rgb(0,0,0,0.04)]"
              >
                <div className="relative h-48 w-full overflow-hidden bg-zinc-100">
                  <img src={photo(r.product.category, r.product.id)} alt={r.product.name} className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent"></div>
                  <span className="absolute left-4 top-4 flex items-center gap-1.5 rounded-full bg-zinc-900/90 backdrop-blur-md px-3 py-1.5 text-[11px] font-bold tracking-wide text-white shadow-sm ring-1 ring-white/20">
                    <Sparkles size={12} className="text-blue-300" />
                    {r.matchScore}% AI MATCH
                  </span>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[12px] font-bold uppercase tracking-wider text-zinc-500">{r.product.brand}</p>
                      <h4 className="mt-1 text-[17px] font-bold text-zinc-900 leading-tight">{r.product.name}</h4>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-2xl font-bold text-zinc-900 tracking-tight">{money(r.product.price)}</p>
                    <div className="flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-[12px] font-bold text-amber-700">
                      ★ {r.product.rating} <span className="font-medium opacity-70">({r.product.reviewCount})</span>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {Object.values(r.product.specifications)
                      .slice(0, 3)
                      .map((x) => (
                        <span key={x} className="rounded-md bg-zinc-100/80 px-2 py-1 text-[12px] font-medium text-zinc-700">
                          {x}
                        </span>
                      ))}
                  </div>
                  
                  <div className="mt-6 flex-1">
                    <p className="text-[12px] font-bold uppercase tracking-wider text-zinc-500 mb-3">Why this matches</p>
                    <ul className="space-y-2">
                      {r.reasons.slice(0, 3).map((x) => (
                        <li key={x} className="flex items-start gap-2 text-[13px] text-zinc-600 leading-relaxed">
                          <Check size={15} className="mt-0.5 shrink-0 text-emerald-500" />
                          {x}
                        </li>
                      ))}
                    </ul>
                  </div>
                  
                  <button
                    onClick={() => select(r)}
                    className="mt-7 w-full rounded-xl bg-zinc-900 py-3 text-[14px] font-semibold text-white transition-all hover:bg-zinc-800 hover:shadow-md focus:outline-none focus:ring-4 focus:ring-zinc-200"
                  >
                    Select product
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

      <section className="rounded-2xl border border-zinc-200 bg-white p-8 mt-4 shadow-sm">
        <h3 className="font-bold text-zinc-900 text-lg">How it works</h3>
        <div className="mt-8 flex flex-col md:flex-row md:items-center justify-between gap-6 relative z-0">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-zinc-100 hidden md:block -translate-y-1/2 -z-10"></div>
          {["Understand", "Discover", "Evaluate", "Approve", "Transact"].map((x, i) => (
            <div key={x} className="flex md:flex-col items-center gap-4 md:gap-3 bg-white px-2">
              <span className="grid size-10 place-items-center rounded-xl bg-zinc-50 text-[13px] font-bold text-zinc-500 border border-zinc-200 shadow-sm transition-colors hover:bg-blue-50 hover:text-blue-600 hover:border-blue-200">
                0{i + 1}
              </span>
              <p className="text-[14px] font-semibold text-zinc-800">{x}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
