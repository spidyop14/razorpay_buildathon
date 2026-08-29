import type { Intent } from "./buyer";
import { getProduct, type Product } from "./catalog";
import { generateGrowthOpportunities } from "./growth/growth-agent";
import type { GrowthOpportunity, OpportunityStatus } from "./growth/types";

export type TransactionPhase =
  | "IDLE"
  | "PRODUCT_SELECTED"
  | "POLICY_CHECKED"
  | "USER_APPROVED"
  | "PAYMENT_READY"
  | "PAYMENT_INITIATED"
  | "PAYMENT_SUCCESS"
  | "PAYMENT_FAILED";

const VALID_TRANSITIONS: Record<TransactionPhase, TransactionPhase[]> = {
  IDLE: ["PRODUCT_SELECTED"],
  PRODUCT_SELECTED: ["POLICY_CHECKED", "IDLE"],
  POLICY_CHECKED: ["USER_APPROVED", "PRODUCT_SELECTED", "IDLE"],
  USER_APPROVED: ["PAYMENT_READY", "PRODUCT_SELECTED", "IDLE"],
  PAYMENT_READY: ["PAYMENT_INITIATED", "PRODUCT_SELECTED", "IDLE"],
  PAYMENT_INITIATED: ["PAYMENT_SUCCESS", "PAYMENT_FAILED"],
  PAYMENT_SUCCESS: ["IDLE"],
  PAYMENT_FAILED: ["IDLE", "PRODUCT_SELECTED"],
};

export function canTransition(from: TransactionPhase, to: TransactionPhase): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export type CommerceSession = {
  sessionId: string;
  createdAt: number;
  expiresAt: number;
  buyerQuery?: string;
  intent?: Intent;
  selectedProduct?: Product;
  opportunities: GrowthOpportunity[];
  activeOpportunityId?: string;
  extras: string[];
  step: number;
  userApproved: boolean;
  transactionPhase: TransactionPhase;
  revision: number;
};

const TTL = 60 * 60 * 1000;

export const emptySession = (): CommerceSession => {
  const now = Date.now();
  return {
    sessionId: `COM-${now.toString(36)}`,
    createdAt: now,
    expiresAt: now + TTL,
    opportunities: [],
    extras: [],
    step: -1,
    userApproved: false,
    transactionPhase: "IDLE",
    revision: 0,
  };
};

export function selectCommerceProduct(
  session: CommerceSession,
  product: Product,
  intent?: Intent
): CommerceSession {
  const opportunities = generateGrowthOpportunities(product, intent);
  return {
    ...session,
    buyerQuery: intent?.raw,
    intent,
    selectedProduct: product,
    opportunities,
    activeOpportunityId: opportunities[0]?.id,
    extras: [],
    userApproved: false,
    transactionPhase: "PRODUCT_SELECTED",
    revision: session.revision + 1,
  };
}

export function updateOpportunityStatus(
  session: CommerceSession,
  id: string,
  status: OpportunityStatus
): CommerceSession {
  return {
    ...session,
    opportunities: session.opportunities.map((x) =>
      x.id === id ? { ...x, status } : x
    ),
    activeOpportunityId: id,
  };
}

export function serializeCommerceSession(session: CommerceSession) {
  return {
    sessionId: session.sessionId,
    createdAt: session.createdAt,
    expiresAt: session.expiresAt,
    selectedProductId: session.selectedProduct?.id,
    buyerQuery: session.buyerQuery,
    intent: session.intent,
    activeOpportunityId: session.activeOpportunityId,
    statuses: session.opportunities.map((x) => ({ id: x.id, status: x.status })),
    extras: session.extras,
    step: session.step,
    userApproved: session.userApproved,
    transactionPhase: session.transactionPhase,
    revision: session.revision,
  };
}

const VALID_PHASES: TransactionPhase[] = [
  "IDLE", "PRODUCT_SELECTED", "POLICY_CHECKED", "USER_APPROVED",
  "PAYMENT_READY", "PAYMENT_INITIATED", "PAYMENT_SUCCESS", "PAYMENT_FAILED",
];

export function restoreCommerceSession(value: unknown): CommerceSession {
  if (!value || typeof value !== "object") return emptySession();

  const raw = value as {
    sessionId?: unknown;
    createdAt?: unknown;
    expiresAt?: unknown;
    selectedProductId?: unknown;
    buyerQuery?: unknown;
    intent?: unknown;
    activeOpportunityId?: unknown;
    statuses?: unknown;
    extras?: unknown;
    step?: unknown;
    userApproved?: unknown;
    transactionPhase?: unknown;
    revision?: unknown;
  };

  // Reject expired sessions
  if (typeof raw.expiresAt !== "number" || raw.expiresAt < Date.now()) return emptySession();

  const intent =
    raw.intent && typeof raw.intent === "object" ? (raw.intent as Intent) : undefined;
  const buyerQuery = typeof raw.buyerQuery === "string" ? raw.buyerQuery : intent?.raw;
  const step = typeof raw.step === "number" && Number.isInteger(raw.step) ? raw.step : -1;
  const revision =
    typeof raw.revision === "number" && Number.isInteger(raw.revision) && raw.revision >= 0
      ? raw.revision
      : 0;

  // Discovery can complete before a product is selected. Keep intent/step so catalog
  // results survive hydration restore. Do not invent a selected product.
  if (typeof raw.selectedProductId !== "string") {
    return {
      ...emptySession(),
      sessionId: typeof raw.sessionId === "string" ? raw.sessionId : emptySession().sessionId,
      createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
      expiresAt: raw.expiresAt,
      buyerQuery,
      intent,
      extras: [],
      step,
      userApproved: false,
      transactionPhase: "IDLE",
      revision,
    };
  }

  const product = getProduct(raw.selectedProductId);
  if (!product) return emptySession();

  // Validate extras: only keep IDs that resolve to real products
  let extras: string[] = [];
  if (Array.isArray(raw.extras)) {
    extras = raw.extras.filter(
      (id): id is string => typeof id === "string" && Boolean(getProduct(id))
    );
  }

  const userApproved = raw.userApproved === true;

  let transactionPhase: TransactionPhase = "PRODUCT_SELECTED";
  if (
    typeof raw.transactionPhase === "string" &&
    VALID_PHASES.includes(raw.transactionPhase as TransactionPhase)
  ) {
    transactionPhase = raw.transactionPhase as TransactionPhase;
  }

  // Don't restore into payment-in-flight states — they need fresh server auth
  if (transactionPhase === "PAYMENT_INITIATED" || transactionPhase === "PAYMENT_READY") {
    transactionPhase = "USER_APPROVED";
  }

  let session: CommerceSession = {
    ...selectCommerceProduct(emptySession(), product, intent),
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : emptySession().sessionId,
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    expiresAt: raw.expiresAt,
    buyerQuery,
    extras,
    step,
    userApproved,
    transactionPhase,
    revision,
  };

  // Restore opportunity statuses
  if (Array.isArray(raw.statuses)) {
    for (const item of raw.statuses) {
      if (item && typeof item === "object") {
        const x = item as { id?: unknown; status?: unknown };
        if (typeof x.id === "string" && typeof x.status === "string") {
          session = updateOpportunityStatus(session, x.id, x.status as OpportunityStatus);
        }
      }
    }
  }

  return session;
}

export function transitionCommerceSession(session: CommerceSession, phase: TransactionPhase): CommerceSession {
  if (session.transactionPhase === phase) return session;
  if (!canTransition(session.transactionPhase, phase)) throw new Error(`INVALID_TRANSACTION_TRANSITION:${session.transactionPhase}:${phase}`);
  return { ...session, transactionPhase: phase };
}
