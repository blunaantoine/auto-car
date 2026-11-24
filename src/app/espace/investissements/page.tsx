import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { Badge, Empty, Notice, PageHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes investissements" };

export default async function MyInvestments({ searchParams }: { searchParams: Promise<{ confirme?: string }> }) {
  const { confirme } = await searchParams;
  const user = await requireUser();
  const investments = await prisma.investment.findMany({
    where: { userId: user.id },
    include: { operation: { include: { updates: { orderBy: { createdAt: "desc" }, take: 1 } } }, ledgerTransaction: true },
    orderBy: { createdAt: "desc" },
  });
  return (
    <>
      <PageHeader title="Mes investissements" subtitle="Chaque participation est rattachée à une seule opération." />
      {confirme && <div className="mb-6"><Notice tone="success">Investissement confirmé. Votre reçu figure ci-dessous et dans vos notifications.</Notice></div>}
      {investments.length ? (
        <div className="grid gap-4 md:grid-cols-2">
          {investments.map((inv) => (
            <article key={inv.id} className="card space-y-3">
              <div className="flex items-start justify-between gap-2">
                <Link href={`/vehicules/${inv.operation.slug}`} className="font-semibold text-ink hover:underline">{inv.operation.title}</Link>
                <StatusBadge status={inv.operation.status} />
              </div>
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm">
                <span className="text-xl font-bold tabular-nums text-ink">{formatMoney(inv.amount)}</span>
                <span className="text-muted">le {formatDate(inv.createdAt)}</span>
                {inv.status === "REFUNDED" && <Badge tone="warning">Remboursé</Badge>}
                {inv.status === "SETTLED" && <Badge tone="success">Clôturé</Badge>}
              </div>
              <div className="text-xs text-muted">Reçu <span className="font-mono">{inv.ledgerTransaction.reference}</span> · conditions {inv.termsVersion} acceptées le {formatDate(inv.riskAcceptedAt)}</div>
              {inv.operation.updates[0] && (
                <div className="rounded-lg bg-paper p-3 text-sm">
                  <div className="text-xs text-muted">Dernière mise à jour · {formatDate(inv.operation.updates[0].createdAt)}</div>
                  <div className="font-medium">{inv.operation.updates[0].title}</div>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty>Vous n&apos;avez pas encore investi. <Link href="/vehicules" className="font-semibold text-accent">Découvrir les opérations</Link></Empty>
      )}
    </>
  );
}
