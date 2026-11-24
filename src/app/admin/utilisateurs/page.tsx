import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { formatDate } from "@/lib/labels";
import { Badge, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Investisseurs" };

export default async function Users({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireActor("backoffice.access");
  const { q } = await searchParams;
  const users = await prisma.user.findMany({
    where: q ? { OR: [{ email: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { id: { endsWith: q.replace(/^IG-/i, "").toLowerCase() } }] } : undefined,
    include: { country: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return (
    <>
      <PageHeader title="Comptes" />
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Nom, e-mail ou référence de dépôt (IG-…)" className="input max-w-md" />
        <button className="btn-ghost">Rechercher</button>
      </form>
      <div className="card table-wrap">
        <table className="table">
          <thead><tr><th>Nom</th><th>E-mail</th><th>Pays</th><th>Rôle</th><th>Statut</th><th>Inscrit</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td><Link href={`/admin/utilisateurs/${u.id}`} className="font-medium text-accent hover:underline">{u.firstName} {u.lastName}</Link><div className="font-mono text-xs text-muted">IG-{u.id.slice(-8).toUpperCase()}</div></td>
                <td>{u.email}</td>
                <td>{u.country.flag} {u.country.name}</td>
                <td>{ROLE_LABELS[u.role]}</td>
                <td><Badge tone={u.status === "ACTIVE" ? "success" : u.status === "SUSPENDED" ? "danger" : "warning"}>{u.status === "ACTIVE" ? "Actif" : u.status === "SUSPENDED" ? "Suspendu" : "Non vérifié"}</Badge></td>
                <td className="text-muted">{formatDate(u.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
