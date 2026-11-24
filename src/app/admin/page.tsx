import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/money";
import { runReconciliation } from "@/lib/services/reconciliation";
import { Badge, PageHeader, Section, Stat, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Administration" };

export default async function AdminHome() {
  const actor = await requireActor("backoffice.access");
  const [investors, openOps, invested, pendingExpenses, closuresToValidate, checks] = await Promise.all([
    prisma.user.count({ where: { role: "INVESTOR" } }),
    prisma.operation.count({ where: { status: { notIn: ["CLOSED", "ARCHIVED", "CANCELLED", "DRAFT"] } } }),
    prisma.investment.aggregate({ where: { status: "ACTIVE" }, _sum: { amount: true } }),
    prisma.operationExpense.findMany({ where: { status: "PENDING" }, include: { operation: true }, orderBy: { createdAt: "asc" }, take: 10 }),
    prisma.operationClosure.findMany({ where: { status: "DRAFT" }, include: { operation: true } }),
    can(actor.role, "ledger.read") ? runReconciliation() : Promise.resolve([]),
  ]);
  return (
    <>
      <PageHeader title="Tableau de bord" />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Investisseurs" value={investors} />
        <Stat label="Opérations actives" value={openOps} />
        <Stat label="Capital engagé (particuliers)" value={formatMoney(invested._sum.amount ?? 0n)} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-2">
        <Section title="À traiter">
          <ul className="space-y-3 text-sm">
            {closuresToValidate.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <span>Clôture à valider : <Link href={`/admin/operations/${c.operationId}`} className="font-medium text-accent hover:underline">{c.operation.title}</Link></span>
                <StatusBadge status={c.operation.status} />
              </li>
            ))}
            {pendingExpenses.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-3">
                <span>Dépense à valider : {e.label} — <Link href={`/admin/operations/${e.operationId}#depenses`} className="text-accent hover:underline">{e.operation.title}</Link></span>
                <span className="tabular-nums">{formatMoney(e.amount)}</span>
              </li>
            ))}
            {!closuresToValidate.length && !pendingExpenses.length && <li className="text-muted">Rien en attente.</li>}
          </ul>
        </Section>
        {checks.length > 0 && (
          <Section title="Rapprochements du grand livre">
            <ul className="space-y-3 text-sm">
              {checks.map((c) => (
                <li key={c.label} className="flex items-start justify-between gap-3">
                  <div><div className="font-medium">{c.label}</div><div className="text-xs text-muted">{c.detail}</div></div>
                  <Badge tone={c.ok ? "success" : "danger"}>{c.ok ? "OK" : "Écart"}</Badge>
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </>
  );
}
