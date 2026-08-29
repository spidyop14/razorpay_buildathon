"use client";
import { CircleAlert, ShieldAlert } from "lucide-react";
import { usePolicies } from "./policy-provider";

export function FailureEvents() {
  const { audit, session, policies } = usePolicies();
  const failures = audit.filter((event) => event.result === "Blocked");

  if (!failures.length) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-full bg-zinc-100 text-zinc-400">
          <ShieldAlert size={22} />
        </div>
        <h4 className="mt-4 font-semibold text-zinc-800">No controlled failures in this session</h4>
        <p className="mt-2 text-sm text-zinc-500 max-w-md mx-auto">
          Policy blocks, unauthorized pricing overrides, and payment verification issues will be recorded here with complete safety context.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 leading-5">
        <b>Safety Sandbox Active:</b> Failures are contained deterministically. The agent is strictly prevented from executing unverified financial actions.
      </div>
      <div className="space-y-3">
        {failures.map((failure, index) => (
          <article
            key={`${failure.time}-${index}`}
            className="rounded-xl border border-rose-200 bg-rose-50 p-5"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <CircleAlert className="mt-0.5 shrink-0 text-rose-600" size={20} />
                <div>
                  <h4 className="font-bold text-rose-900">{failure.action}</h4>
                  <p className="mt-1 text-sm font-medium text-rose-800">
                    Reason: {failure.policy}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-rose-100 px-2.5 py-1 text-xs font-bold text-rose-700">
                BLOCKED SAFELY
              </span>
            </div>

            <div className="mt-4 grid gap-3 border-t border-rose-100 pt-3 text-xs sm:grid-cols-3">
              <div>
                <p className="text-zinc-500 font-semibold uppercase tracking-wider">Amount evaluated</p>
                <p className="mt-1 text-sm font-bold text-zinc-800">{failure.amount || "—"}</p>
              </div>
              <div>
                <p className="text-zinc-500 font-semibold uppercase tracking-wider">System Action</p>
                <p className="mt-1 text-zinc-700">Transaction halted; checkout prevented.</p>
              </div>
              <div>
                <p className="text-zinc-500 font-semibold uppercase tracking-wider">Retry Availability</p>
                <p className="mt-1 text-zinc-700">
                  {policies.maximumPaymentRetries > 0
                    ? `Max ${policies.maximumPaymentRetries} retry allowed by policy`
                    : "Retries disabled by policy"}
                </p>
              </div>
            </div>

            <div className="mt-3 flex items-center justify-between text-[11px] text-zinc-400">
              <span>Actor: {failure.actor}</span>
              <span>Session {session.sessionId.slice(-6)} · {failure.time}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
