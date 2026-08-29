"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Bot,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  CreditCard,
  Gauge,
  Menu,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  X,
} from "lucide-react";
import { useState } from "react";
import { BuyerFlow } from "../components/buyer-flow";
import { PolicySettings } from "../components/policy-settings";
import { AuditEvents } from "../components/audit-events";
import { MerchantGrowth } from "../components/merchant-growth";
import { FailureEvents } from "../components/failure-events";
import { usePolicies } from "../components/policy-provider";

type IconType = typeof Gauge;
const nav: { href: string; label: string; icon: IconType }[] = [
  { href: "/", label: "Overview", icon: Gauge },
  { href: "/buyer", label: "AI Buyer", icon: Bot },
  { href: "/merchant", label: "Merchant Growth", icon: Store },
  { href: "/policies", label: "Policies", icon: ShieldCheck },
  { href: "/audit", label: "Audit Trail", icon: ClipboardList },
  { href: "/failures", label: "Failure Center", icon: CircleAlert },
];

const cx = (...v: string[]) => v.filter(Boolean).join(" ");

function Badge({
  children,
  tone = "blue",
}: {
  children: React.ReactNode;
  tone?: "blue" | "green" | "amber" | "gray" | "rose";
}) {
  const t = {
    blue: "bg-blue-50 text-blue-700 ring-blue-100",
    green: "bg-emerald-50 text-emerald-700 ring-emerald-100",
    amber: "bg-amber-50 text-amber-700 ring-amber-100",
    gray: "bg-zinc-100 text-zinc-600 ring-zinc-200",
    rose: "bg-rose-50 text-rose-700 ring-rose-100",
  }[tone];
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1",
        t
      )}
    >
      {children}
    </span>
  );
}

function Sidebar({ open, close }: { open: boolean; close: () => void }) {
  const path = usePathname();
  return (
    <>
      <div
        onClick={close}
        className={cx(
          "fixed inset-0 z-30 bg-zinc-900/25 lg:hidden",
          open ? "block" : "hidden"
        )}
      />
      <aside
        className={cx(
          "fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-zinc-200 bg-white px-4 py-5 transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="mb-9 flex items-center justify-between px-2">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-xl bg-zinc-900 text-sm font-bold text-white">
              AC
            </span>
            <span>
              <b className="block text-sm tracking-tight">Agentic Commerce</b>
              <small className="text-xs text-zinc-500">Control Center</small>
            </span>
          </Link>
          <button aria-label="Close navigation" onClick={close} className="lg:hidden">
            <X size={19} />
          </button>
        </div>
        <nav className="space-y-1">
          {nav.map(({ href, label, icon: Icon }) => (
            <Link
              onClick={close}
              key={href}
              href={href}
              className={cx(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition",
                path === href
                  ? "bg-blue-50 text-blue-700 font-semibold"
                  : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900"
              )}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="mb-1 text-xs font-semibold text-zinc-800">Test Environment</p>
            <p className="flex items-center gap-2 text-xs text-zinc-500">
              <i className="size-1.5 rounded-full bg-emerald-500" />
              Razorpay Test Mode
            </p>
          </div>
          <div className="flex items-center gap-3 px-2">
            <span className="grid size-9 place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
              S
            </span>
            <span>
              <b className="block text-sm">Sanjai</b>
              <small className="text-xs text-zinc-500">Builder</small>
            </span>
          </div>
        </div>
      </aside>
    </>
  );
}

function Shell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const { resetDemo } = usePolicies();

  return (
    <div>
      <Sidebar open={open} close={() => setOpen(false)} />
      <main className="min-h-screen lg:ml-72">
        <header className="sticky top-0 z-20 flex h-18 items-center justify-between border-b border-zinc-200 bg-white/90 px-5 backdrop-blur md:px-8">
          <button
            onClick={() => setOpen(true)}
            aria-label="Open navigation"
            className="rounded-md p-2 hover:bg-zinc-100 lg:hidden"
          >
            <Menu size={20} />
          </button>
          <div className="hidden lg:block">
            <h1 className="text-sm font-semibold">{title}</h1>
            <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={resetDemo}
              title="Reset commerce session, audit logs, and approval states"
              className="flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 shadow-sm transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
            >
              <RotateCcw size={13} />
              Reset Demo
            </button>
            <Badge tone="green">● Test Mode</Badge>
            <button aria-label="Notifications" className="rounded-md p-2 text-zinc-500 hover:bg-zinc-100">
              <Bell size={18} />
            </button>
            <span className="grid size-8 place-items-center rounded-full bg-zinc-900 text-xs font-bold text-white">
              S
            </span>
          </div>
        </header>
        <div className="mx-auto max-w-7xl px-5 py-8 md:px-8 md:py-10">
          <div className="mb-8 lg:hidden">
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-zinc-500">{description}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function PageHeader({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description: string;
  eyebrow?: string;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-blue-600">
        {eyebrow && (
          <>
            <Sparkles size={14} />
            {eyebrow}
          </>
        )}
      </div>
      <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">{title}</h2>
      <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500 md:text-base">{description}</p>
    </div>
  );
}

function Stat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,.02)]">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-3 text-2xl font-bold tracking-tight">{value}</p>
      <p className="mt-2 text-xs font-medium text-emerald-600">{detail}</p>
    </div>
  );
}

function LiveActivity() {
  const { audit } = usePolicies();
  const recent = audit.slice(0, 5);

  const getIcon = (actor: string) => {
    if (actor === "AI Buyer") return Search;
    if (actor === "Merchant Growth Agent" || actor === "Merchant") return Sparkles;
    if (actor === "Policy Engine") return ShieldCheck;
    if (actor === "Razorpay") return CreditCard;
    return Bot;
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white">
      <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-4">
        <h3 className="font-semibold">Live Agent Activity</h3>
        <Link
          href="/audit"
          className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
        >
          View all
        </Link>
      </div>
      {!recent.length ? (
        <div className="p-8 text-center text-sm text-zinc-500">
          No live session activity yet. Start discovery in{" "}
          <Link href="/buyer" className="font-semibold text-blue-600 hover:underline">
            AI Buyer
          </Link>
          .
        </div>
      ) : (
        <div className="divide-y divide-zinc-100">
          {recent.map((a, i) => {
            const Icon = getIcon(a.actor);
            const isBlock = a.result === "Blocked";
            const isAllowed = a.result === "Allowed";
            return (
              <div key={`${a.time}-${i}`} className="flex items-center gap-4 px-5 py-4">
                <span
                  className={cx(
                    "grid size-9 shrink-0 place-items-center rounded-full",
                    isBlock
                      ? "bg-rose-50 text-rose-600"
                      : isAllowed
                      ? "bg-emerald-50 text-emerald-600"
                      : "bg-blue-50 text-blue-600"
                  )}
                >
                  <Icon size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{a.actor}</p>
                  <p className="truncate text-sm text-zinc-500">
                    {a.action} · {a.amount} ({a.policy})
                  </p>
                </div>
                <time className="whitespace-nowrap text-xs text-zinc-400">{a.time}</time>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CurrentWorkflow() {
  const { session } = usePolicies();
  const stages = [
    "Buyer intent",
    "Product",
    "Growth opportunity",
    "Policy",
    "Approval",
    "Payment",
  ];
  const complete =
    session.transactionPhase === "PAYMENT_SUCCESS"
      ? 6
      : session.transactionPhase === "PAYMENT_READY" ||
        session.transactionPhase === "PAYMENT_INITIATED"
      ? 5
      : session.userApproved
      ? 4
      : session.selectedProduct
      ? 2
      : 0;

  return (
    <section className="mb-6 rounded-xl border border-blue-100 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
            Current transaction
          </p>
          <p className="mt-1 font-semibold">
            {session.selectedProduct
              ? session.selectedProduct.name
              : "No buyer selection yet"}
          </p>
        </div>
        <Badge
          tone={
            session.transactionPhase === "PAYMENT_SUCCESS"
              ? "green"
              : session.transactionPhase === "PAYMENT_FAILED"
              ? "rose"
              : "blue"
          }
        >
          {session.transactionPhase.replaceAll("_", " ")}
        </Badge>
      </div>
      <div className="mt-5 grid gap-2 sm:grid-cols-6">
        {stages.map((stage, index) => (
          <div
            key={stage}
            className={cx(
              "rounded-lg px-3 py-2 text-xs font-semibold text-center",
              index < complete
                ? "bg-emerald-50 text-emerald-700"
                : "bg-zinc-50 text-zinc-400"
            )}
          >
            {index + 1}. {stage}
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm text-zinc-600">
        AI Buyer and Merchant Agent propose; the deterministic Policy Engine controls every
        financial action before Razorpay Test Mode can open.
      </p>
    </section>
  );
}

const opportunities = [
  ["Laptop + Mouse Bundle", "Potential revenue", "+₹42,000"],
  ["High-intent headphone buyers", "Potential conversion", "+8.4%"],
  ["Weekend accessory campaign", "Estimated uplift", "+₹18,500"],
];

function Overview() {
  const { blockCount, session } = usePolicies();

  return (
    <Shell
      title="Overview"
      description="Your agentic commerce system at a glance"
    >
      <PageHeader
        eyebrow="System overview"
        title="Agentic Commerce Control Center"
        description="Let AI discover, decide and transact — with every financial action controlled by policy."
      />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-blue-100 bg-blue-50/60 px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="grid size-9 place-items-center rounded-full bg-blue-600 text-white">
            <ShieldCheck size={18} />
          </span>
          <div>
            <b className="block text-sm">
              AI Commerce System{" "}
              <span className="font-normal text-zinc-500">
                · All systems operational
              </span>
            </b>
            <small className="text-xs text-blue-700">Protected by policy controls</small>
          </div>
        </div>
        <Badge tone="green">● Razorpay Test Mode</Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Active product"
          value={session.selectedProduct ? session.selectedProduct.name : "None"}
          detail={session.selectedProduct ? `₹${session.selectedProduct.price.toLocaleString("en-IN")}` : "Ready for discovery"}
        />
        <Stat
          label="Growth opportunities"
          value={String(session.opportunities.length)}
          detail="Computed from live session"
        />
        <Stat
          label="Transaction state"
          value={session.transactionPhase.replaceAll("_", " ")}
          detail="Deterministic machine"
        />
        <Stat
          label="Policy blocks"
          value={String(blockCount)}
          detail={blockCount > 0 ? "Safely contained" : "No blocks in session"}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1.55fr_1fr]">
        <LiveActivity />
        <div className="rounded-xl border border-zinc-200 bg-white p-5">
          <h3 className="font-semibold">Commerce Health</h3>
          <p className="mt-1 text-sm text-zinc-500">Real-time system checks</p>
          <div className="mt-6 space-y-4">
            {[
              "Catalog availability",
              "Payment system",
              "Policy engine",
              "Agent status",
            ].map((x) => (
              <div key={x} className="flex items-center justify-between">
                <span className="text-sm">{x}</span>
                <Badge tone="green">● Healthy</Badge>
              </div>
            ))}
          </div>
        </div>
      </div>

      <section className="mt-8">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold">Revenue Opportunities</h3>
          <Link href="/merchant" className="text-sm font-semibold text-blue-600 hover:underline">
            Explore all
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {opportunities.map(([a, b, c]) => (
            <div
              key={a}
              className="group rounded-xl border border-zinc-200 bg-white p-5 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-md"
            >
              <span className="grid size-9 place-items-center rounded-lg bg-amber-50 text-amber-600">
                <Sparkles size={18} />
              </span>
              <h4 className="mt-5 font-semibold">{a}</h4>
              <p className="mt-2 text-sm text-zinc-500">{b}</p>
              <p className="mt-1 text-xl font-bold text-emerald-600">{c}</p>
              <Link
                href="/merchant"
                className="mt-5 flex items-center gap-1 text-sm font-semibold text-blue-600"
              >
                Review opportunity <ChevronRight size={15} />
              </Link>
            </div>
          ))}
        </div>
      </section>
    </Shell>
  );
}

function BuyerEnhanced() {
  return (
    <Shell
      title="AI Buyer"
      description="Agent-assisted product discovery"
    >
      <PageHeader
        eyebrow="Buyer agent"
        title="AI Buyer"
        description="Describe what you need. The agent handles discovery and prepares the transaction."
      />
      <BuyerFlow />
    </Shell>
  );
}

function PoliciesEnhanced() {
  return (
    <Shell
      title="Commerce Policies"
      description="Safety boundaries for your agents"
    >
      <PageHeader
        eyebrow="Policy controls"
        title="Commerce Policies"
        description="Define the boundaries within which agents can operate."
      />
      <PolicySettings />
    </Shell>
  );
}

function AuditEnhanced() {
  return (
    <Shell
      title="Audit Trail"
      description="Traceable agent decisions"
    >
      <PageHeader
        eyebrow="Transparent by design"
        title="Audit Trail"
        description="Every agent decision and financial action is traceable."
      />
      <AuditEvents />
    </Shell>
  );
}

function FailuresEnhanced() {
  return (
    <Shell
      title="Failure Center"
      description="Safe, controlled failure handling"
    >
      <PageHeader
        eyebrow="Safety story"
        title="Failure Center"
        description="Real session failures are recorded, explained, and contained safely."
      />
      <FailureEvents />
    </Shell>
  );
}

function MerchantEnhanced() {
  return (
    <Shell
      title="Merchant Growth"
      description="AI-generated revenue opportunities"
    >
      <PageHeader
        eyebrow="Growth agent"
        title="Merchant Growth"
        description="Bounded, margin-aware opportunities designed to increase order value."
      />
      <MerchantGrowth />
    </Shell>
  );
}

export function App({
  page,
}: {
  page: "overview" | "buyer" | "merchant" | "policies" | "audit" | "failures";
}) {
  return {
    overview: (
      <>
        <CurrentWorkflow />
        <Overview />
      </>
    ),
    buyer: <BuyerEnhanced />,
    merchant: <MerchantEnhanced />,
    policies: <PoliciesEnhanced />,
    audit: <AuditEnhanced />,
    failures: <FailuresEnhanced />,
  }[page];
}
