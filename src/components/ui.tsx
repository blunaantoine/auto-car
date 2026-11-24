import type { OperationStatus } from "@prisma/client";
import type { ReactNode } from "react";
import { STATUS_LABELS, statusTone, type StatusTone } from "@/lib/domain/operation-status";

const TONES: Record<StatusTone, string> = {
  neutral: "bg-gray-100 text-gray-700 ring-gray-200",
  info: "bg-sky-50 text-sky-800 ring-sky-200",
  success: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
};

export function Badge({ tone = "neutral", children }: { tone?: StatusTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]}`}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: OperationStatus }) {
  return <Badge tone={statusTone(status)}>{STATUS_LABELS[status]}</Badge>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, emphasis }: { label: string; value: ReactNode; hint?: ReactNode; emphasis?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${emphasis ? "border-accent/30 bg-accent-soft" : "border-line bg-white"}`}>
      <div className="text-xs font-medium tracking-wide text-muted uppercase">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums text-ink">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function Progress({ value, max }: { value: bigint; max: bigint }) {
  const pct = max === 0n ? 0 : Math.min(100, Number((value * 1000n) / max) / 10);
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warning" | "danger" | "success"; children: ReactNode }) {
  const cls = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warning: "border-amber-200 bg-amber-50 text-amber-900",
    danger: "border-red-200 bg-red-50 text-red-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  }[tone];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-dashed border-line bg-white px-4 py-10 text-center text-sm text-muted">{children}</div>;
}

export function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="card">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function KeyValue({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="divide-y divide-line/70 text-sm">
      {items.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4 py-2">
          <dt className="text-muted">{k}</dt>
          <dd className="text-right font-medium tabular-nums text-gray-900">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

export function CarPlaceholder({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-ink to-accent text-white/90">
      <div className="text-center">
        <svg viewBox="0 0 64 32" className="mx-auto h-10 w-20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M6 22h52M10 22l4-9c1-2 3-3 5-3h22c2 0 4 1 5 3l6 9" />
          <circle cx="18" cy="23" r="4" fill="currentColor" />
          <circle cx="46" cy="23" r="4" fill="currentColor" />
        </svg>
        <div className="mt-2 text-sm font-semibold">{label}</div>
      </div>
    </div>
  );
}
