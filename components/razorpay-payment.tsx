"use client";
import { useEffect, useState } from "react";
import type { PolicyConfig } from "../lib/policy/types";
import type { TransactionPhase } from "../lib/commerce-session";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type Order = {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
};

type PaymentStatus = "idle" | "verifying" | "processing" | "success" | "failed";

export function RazorpayPayment({
  productId,
  extraIds,
  policies,
  idempotencyKey,
  onPhase,
  onEvent,
}: {
  productId: string;
  extraIds: string[];
  policies: PolicyConfig;
  idempotencyKey: string;
  onPhase: (phase: TransactionPhase) => void;
  onEvent: (action: string, result: "Allowed" | "Blocked" | "Pending", amount: string) => void;
}) {
  const [status, setStatus] = useState<PaymentStatus>("verifying");
  const [message, setMessage] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [serverVerified, setServerVerified] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [retryAllowed, setRetryAllowed] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  // Authoritative server pre-check on mount
  useEffect(() => {
    let active = true;
    async function verifyServerFinancials() {
      try {
        setStatus("verifying");
        const res = await fetch("/api/payment/recalculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productId, extraIds, policies, userApproval: true }),
        });
        const data = (await res.json()) as {
          state?: string;
          amount?: number;
          error?: string;
        };
        if (!active) return;
        if (!res.ok || data.state !== "APPROVED") {
          setServerVerified(false);
          setStatus("failed");
          setMessage(data.error || "Server policy verification blocked this transaction.");
          return;
        }
        setServerVerified(true);
        setStatus("idle");
        onPhase("PAYMENT_READY");
      } catch {
        if (!active) return;
        setServerVerified(false);
        setStatus("failed");
        setMessage("Could not connect to server for financial verification.");
      }
    }
    verifyServerFinancials();
    return () => {
      active = false;
    };
    // The quote inputs define verification; phase reporting must not restart it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, extraIds, policies]);

  async function pay() {
    try {
      setStatus("processing");
      setMessage("Preparing your secure Test Mode checkout…");

      const auth = await fetch("/api/payment/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId, extraIds, policies, userApproval: true, idempotencyKey }),
      });
      const quote = (await auth.json()) as { transactionId?: string; error?: string };
      if (!auth.ok || !quote.transactionId) {
        throw new Error(quote.error || "Payment authorization failed.");
      }
      setTransactionId(quote.transactionId);

      const orderRes = await fetch("/api/payment/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transactionId: quote.transactionId }),
      });
      const raw = (await orderRes.json()) as Partial<Order> & { error?: string };
      if (!orderRes.ok || !raw.orderId || !raw.amount || !raw.keyId || !raw.currency) {
        throw new Error(raw.error || "Order creation failed.");
      }
      const order: Order = {
        orderId: raw.orderId,
        amount: raw.amount,
        currency: raw.currency,
        keyId: raw.keyId,
      };

      onEvent(
        "Test order created",
        "Allowed",
        `₹${(order.amount / 100).toLocaleString("en-IN")}`
      );
      onPhase("PAYMENT_INITIATED");

      if (!window.Razorpay) {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        await new Promise((resolve, reject) => {
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        });
      }

      const checkout = new window.Razorpay!({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Agentic Commerce",
        description: "Agentic Commerce Test Order",
        order_id: order.orderId,
        theme: { color: "#2563eb" },
        modal: {
          ondismiss: () => {
            if (status !== "success") {
              setStatus("idle");
              setMessage("Checkout window closed.");
              onEvent("Checkout dismissed", "Pending", "—");
            }
          },
        },
        handler: async (response: Record<string, string>) => {
          try {
            setMessage("Verifying payment signature…");
            const verified = await fetch("/api/payment/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                transactionId: quote.transactionId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
              }),
            });
            const data = (await verified.json()) as { paymentId?: string; error?: string; retryAllowed?: boolean; retryCount?: number };
            if (!verified.ok || !data.paymentId) {
              setRetryAllowed(Boolean(data.retryAllowed));
              setRetryCount(data.retryCount || 0);
              throw new Error(data.error || "Payment verification failed.");
            }
            setStatus("success");
            setPaymentId(data.paymentId);
            setMessage(`Payment successful · ${data.paymentId}`);
            onPhase("PAYMENT_SUCCESS");
            onEvent(
              "Payment verified",
              "Allowed",
              `₹${(order.amount / 100).toLocaleString("en-IN")}`
            );
          } catch (err) {
            setStatus("failed");
            setMessage(err instanceof Error ? err.message : "Payment verification failed.");
            onPhase("PAYMENT_FAILED");
            onEvent("Payment verification failed", "Blocked", "—");
          }
        },
      });

      checkout.open();
      setMessage("Checkout initiated in Razorpay Test Mode.");
    } catch (error) {
      setStatus("failed");
      setMessage(error instanceof Error ? error.message : "Payment could not be initiated.");
      onEvent("Payment failed", "Blocked", "—");
      onPhase("PAYMENT_FAILED");
    }
  }

  if (status === "success") {
    return (
      <section className="rounded-xl border border-emerald-300 bg-emerald-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Razorpay Test Mode
        </p>
        <h3 className="mt-1 font-bold text-emerald-900">Payment completed</h3>
        <p className="mt-2 text-sm text-emerald-700">
          Transaction ID: {paymentId || "Verified"}
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Order successfully placed in Razorpay Test Mode.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
        Razorpay Test Mode
      </p>
      <h3 className="mt-1 font-bold">{status === "failed" ? "Payment needs attention" : "Payment ready"}</h3>
      <p className="mt-2 text-sm text-zinc-600">
        Policy approved · User approved · Amount verified by server
      </p>
      <button
        onClick={pay}
        disabled={status === "processing" || status === "verifying" || !serverVerified || (status === "failed" && !retryAllowed)}
        className="mt-4 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition"
      >
        {status === "processing"
          ? "Preparing checkout…"
          : status === "verifying"
          ? "Verifying with server…"
          : status === "failed" ? retryAllowed ? "Retry with Razorpay" : "Retry limit reached" : "Pay with Razorpay"}
      </button>
      {message && (
        <p
          className={`mt-3 text-sm ${
            status === "failed" ? "text-rose-600" : "text-zinc-600"
          }`}
        >
          {message}
        </p>
      )}
      {transactionId && <p className="mt-2 text-xs text-zinc-500">Trusted transaction: {transactionId.slice(0, 8)}… · retries {retryCount}</p>}
    </section>
  );
}
