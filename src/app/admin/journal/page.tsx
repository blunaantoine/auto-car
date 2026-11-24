import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { formatDateTime } from "@/lib/labels";
import { PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Journal d'audit" };

export default async function AuditJournal() {
  await requireActor("audit.read");
  const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200 });
  const actors = await prisma.user.findMany({ where: { id: { in: [...new Set(logs.map((l) => l.actorId).filter(Boolean) as string[])] } }, select: { id: true, firstName: true, lastName: true } });
  const name = (id: string | null) => { const a = actors.find((x) => x.id === id); return a ? `${a.firstName} ${a.lastName}` : "Système"; };
  return (
    <>
      <PageHeader title="Journal d'audit" subtitle="Non modifiable. 200 dernières actions sensibles." />
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Date</th><th>Auteur</th><th>Action</th><th>Objet</th><th>Motif</th><th>Détail</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-muted">{formatDateTime(l.createdAt)}</td>
                <td>{name(l.actorId)}<div className="text-xs text-muted">{l.actorRole}{l.ip ? ` · ${l.ip}` : ""}</div></td>
                <td className="font-mono text-xs">{l.action}</td>
                <td className="text-xs">{l.entityType}<div className="font-mono text-muted">{l.entityId?.slice(-10)}</div></td>
                <td className="text-xs">{l.reason ?? "—"}</td>
                <td className="max-w-xs">
                  {(l.before || l.after) && (
                    <details className="text-xs"><summary className="cursor-pointer text-accent">Voir</summary>
                      <pre className="mt-1 max-h-48 overflow-auto rounded bg-paper p-2 whitespace-pre-wrap">{JSON.stringify({ avant: l.before, après: l.after }, null, 1)}</pre>
                    </details>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
