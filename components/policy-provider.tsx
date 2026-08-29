"use client";
import { createContext, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { defaultPolicies } from "../lib/policy/default-policies";
import type { PolicyConfig } from "../lib/policy/types";
import type { Product } from "../lib/catalog";
import type { Intent } from "../lib/buyer";
import {
  emptySession,
  restoreCommerceSession,
  selectCommerceProduct,
  serializeCommerceSession,
  updateOpportunityStatus,
  transitionCommerceSession,
  type CommerceSession,
  type TransactionPhase,
} from "../lib/commerce-session";
import type { OpportunityStatus } from "../lib/growth/types";

type Audit = {
  time: string;
  actor: string;
  action: string;
  amount: string;
  policy: string;
  result: "Allowed" | "Pending" | "Blocked";
};

type Value = {
  policies: PolicyConfig;
  setPolicies: (p: PolicyConfig) => void;
  audit: Audit[];
  record: (e: Omit<Audit, "time">) => void;
  blockCount: number;
  session: CommerceSession;
  selectProduct: (p: Product, i?: Intent) => void;
  updateOpportunity: (id: string, status: OpportunityStatus) => void;
  expired: boolean;
  startNewSession: () => void;
  resetDemo: () => void;
  setSessionExtras: (extras: string[]) => void;
  setSessionStep: (step: number) => void;
  setSessionUserApproved: (approved: boolean) => void;
  setTransactionPhase: (phase: TransactionPhase) => void;
  setSessionIntent: (intent?: Intent, query?: string) => void;
};

const Context = createContext<Value | undefined>(undefined);

function useIsExpired(expiresAt: number): boolean {
  return useSyncExternalStore(
    (callback) => {
      const remaining = Math.max(0, expiresAt - Date.now());
      const timer = setTimeout(callback, remaining);
      return () => clearTimeout(timer);
    },
    () => expiresAt < Date.now(),
    () => false
  );
}

export function PolicyProvider({ children }: { children: React.ReactNode }) {
  const [policies, setPoliciesState] = useState<PolicyConfig>(defaultPolicies);

  const [audit, setAudit] = useState<Audit[]>([]);
  const [session, setSessionState] = useState<CommerceSession>(emptySession());

  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem("ac-audit") || "[]");
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (Array.isArray(v)) setAudit(v);
    } catch {}
    try {
      const s = JSON.parse(localStorage.getItem("ac-session") || "null");
      setSessionState(restoreCommerceSession(s));
    } catch {}
  }, []);

  const expired = useIsExpired(session.expiresAt);

  useEffect(() => {
    fetch("/api/policy").then(async (response) => response.ok ? response.json() : undefined)
      .then((data: { policies?: PolicyConfig } | undefined) => { if (data?.policies) setPoliciesState(data.policies); })
      .catch(() => undefined);
  }, []);

  const persist = (next: CommerceSession) => {
    setSessionState(next);
    localStorage.setItem(
      "ac-session",
      JSON.stringify(serializeCommerceSession(next))
    );
  };

  const setPolicies = (p: PolicyConfig) => {
    void fetch("/api/policy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ policies: p }) })
      .then(async (response) => response.ok ? response.json() : Promise.reject())
      .then((data: { policies: PolicyConfig }) => {
        setPoliciesState(data.policies);
        // A policy change makes any previously prepared quote untrusted.
        persist({ ...session, userApproved: false, transactionPhase: session.selectedProduct ? "PRODUCT_SELECTED" : "IDLE", revision: session.revision + 1 });
        record({ actor: "Policy Engine", action: "Server policy configuration updated", amount: "—", policy: "Payment readiness invalidated", result: "Allowed" });
      })
      .catch(() => record({ actor: "Policy Engine", action: "Policy configuration update rejected", amount: "—", policy: "Server validation", result: "Blocked" }));
  };

  const record = (e: Omit<Audit, "time">) => setAudit((x) => {
    const next = [{ ...e, time: new Date().toLocaleTimeString("en-IN", { hour12: false }) }, ...x].slice(0, 100);
    localStorage.setItem("ac-audit", JSON.stringify(next));
    return next;
  });

  const selectProduct = (p: Product, i?: Intent) => {
    const next = selectCommerceProduct(session, p, i);
    persist(next);
    record({
      actor: "AI Buyer",
      action: "Product selected",
      amount: `₹${p.price.toLocaleString("en-IN")}`,
      policy: "Catalog verified",
      result: "Allowed",
    });
    if (next.opportunities[0])
      record({
        actor: "Merchant Growth Agent",
        action: "Opportunity detected",
        amount: `₹${next.opportunities[0].offer.proposedPrice.toLocaleString("en-IN")}`,
        policy: "Relationship data",
        result: "Pending",
      });
  };

  const updateOpportunity = (id: string, status: OpportunityStatus) => {
    const next = updateOpportunityStatus(session, id, status);
    const opportunity = next.opportunities.find((item) => item.id === id);
    if (status === "MERCHANT_APPROVED" && opportunity) {
      persist({ ...next, extras: opportunity.relatedProducts.map((item) => item.id), userApproved: false, transactionPhase: "PRODUCT_SELECTED", revision: next.revision + 1 });
      return;
    }
    persist(next);
  };

  const startNewSession = () => {
    const next = emptySession();
    persist(next);
    record({
      actor: "System",
      action: "New commerce session started",
      amount: "—",
      policy: "Session reset",
      result: "Allowed",
    });
  };

  const resetDemo = () => {
    const next = emptySession();
    persist(next);
    setAudit([]);
    localStorage.removeItem("ac-audit");
  };

  const setSessionExtras = (extras: string[]) =>
    persist({ ...session, extras, userApproved: false, transactionPhase: "PRODUCT_SELECTED", revision: session.revision + 1 });

  const setSessionStep = (step: number) =>
    persist({ ...session, step });

  const setSessionUserApproved = (approved: boolean) => {
    const checked = session.transactionPhase === "PRODUCT_SELECTED" ? transitionCommerceSession(session, "POLICY_CHECKED") : session;
    persist({ ...transitionCommerceSession(checked, approved ? "USER_APPROVED" : "PRODUCT_SELECTED"), userApproved: approved });
  };

  const setTransactionPhase = (phase: TransactionPhase) => {
    try { persist(transitionCommerceSession(session, phase)); }
    catch { record({ actor: "System", action: "Invalid transaction transition rejected", amount: "—", policy: `${session.transactionPhase} → ${phase}`, result: "Blocked" }); }
  };

  const setSessionIntent = (intent?: Intent, query?: string) =>
    persist({
      ...session,
      intent,
      buyerQuery: query ?? session.buyerQuery,
    });

  return (
    <Context.Provider
      value={{
        policies,
        setPolicies,
        audit,
        record,
        blockCount: audit.filter((x) => x.result === "Blocked").length,
        session,
        selectProduct,
        updateOpportunity,
        expired,
        startNewSession,
        resetDemo,
        setSessionExtras,
        setSessionStep,
        setSessionUserApproved,
        setTransactionPhase,
        setSessionIntent,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export const usePolicies = () => {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("PolicyProvider missing");
  return ctx;
};
