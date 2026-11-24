import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { formatDateTime, TX_TYPE_LABELS } from "@/lib/labels";
import { formatSigned } from "@/lib/money";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Grand livre" };

export default async function Ledger() {
  await requireActor("ledger.read");
  const txs = await prisma.ledgerTransaction.findMany({ include: { entries: { include: { account: true } } }, orderBy: { createdAt: "desc" }, take: 100 });
  return (
    <>
      <PageHeader title="Grand livre" subtitle="Écritures immuables en partie double. Les corrections passent par une écriture inverse." />
      <div className="space-y-3">
        {txs.map((t) => (
          <div key={t.id} className="card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <div><span className="font-mono text-xs">{t.reference}</span> · <strong>{TX_TYPE_LABELS[t.type]}</strong> · {t.description}</div>
              <div className="text-xs text-muted">{formatDateTime(t.createdAt)}</div>
            </div>
            <table className="mt-2 w-full text-xs">
              <tbody>
                {t.entries.map((e) => (
                  <tr key={e.id} className="border-t border-line/60">
                    <td className="py-1 font-mono">{e.account.code.replace(/:(.{8}).*$/, (_m, s) => `:${s}…`)}</td>
                    <td className="py-1 text-muted">{e.memo}</td>
                    <td className="py-1 text-right tabular-nums">{formatSigned(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </>
  );
}
