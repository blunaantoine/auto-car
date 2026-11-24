import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/labels";
import { Empty, PageHeader, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Opérations" };

export default async function AdminOperations() {
  const actor = await requireActor("backoffice.access");
  const ops = await prisma.operation.findMany({ include: { _count: { select: { investments: true } } }, orderBy: { createdAt: "desc" } });
  return (
    <>
      <PageHeader title="Opérations" actions={can(actor.role, "operations.manage") && <Link href="/admin/operations/nouvelle" className="btn-primary">Nouvelle opération</Link>} />
      {ops.length ? (
        <div className="card table-wrap">
          <table className="table">
            <thead><tr><th>Opération</th><th>État</th><th className="text-right">Financé / objectif</th><th className="text-right">Participants</th><th>Créée</th></tr></thead>
            <tbody>
              {ops.map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/operations/${o.id}`} className="font-medium text-accent hover:underline">{o.title}</Link></td>
                  <td><StatusBadge status={o.status} /></td>
                  <td className="text-right tabular-nums whitespace-nowrap">{formatMoney(o.investorFunded)} / {formatMoney(o.investorTarget)}</td>
                  <td className="text-right">{o._count.investments}</td>
                  <td className="text-muted">{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty>Aucune opération.</Empty>
      )}
    </>
  );
}
