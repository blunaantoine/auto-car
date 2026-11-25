import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { AGENT_STATUS_LABELS } from "@/lib/domain/deposit";
import { createAgentAction } from "@/app/actions/deposits";
import { AgentForm } from "@/components/agent-form";
import { Badge, Empty, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Agents" };

export default async function Agents() {
  const actor = await requireActor("backoffice.access");
  const [agents, countries] = await Promise.all([
    prisma.agent.findMany({
      include: { country: true, user: true, paymentMethods: { where: { active: true } }, _count: { select: { deposits: { where: { status: "AWAITING_AGENT" } } } } },
      orderBy: [{ countryCode: "asc" }, { city: "asc" }],
    }),
    prisma.country.findMany({ orderBy: { name: "asc" } }),
  ]);
  return (
    <>
      <PageHeader title="Agents locaux" subtitle="Agents habilités à recevoir les dépôts, par pays et moyen de paiement." />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <Section title={`Agents (${agents.length})`}>
          {agents.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Agent</th><th>Pays / ville</th><th>Moyens actifs</th><th>En attente</th><th>Statut</th></tr></thead>
                <tbody>
                  {agents.map((a) => (
                    <tr key={a.id}>
                      <td><Link href={`/admin/agents/${a.id}`} className="font-medium text-accent hover:underline">{a.displayName}</Link><div className="text-xs text-muted">{a.user.email}</div></td>
                      <td>{a.country.flag} {a.country.name}<div className="text-xs text-muted">{a.city}{a.zone ? ` · ${a.zone}` : ""}</div></td>
                      <td>{a.paymentMethods.map((m) => m.provider).join(", ") || <span className="text-red-700">aucun</span>}</td>
                      <td>{a._count.deposits}</td>
                      <td><Badge tone={a.status === "ACTIVE" ? "success" : a.status === "SUSPENDED" ? "danger" : "warning"}>{AGENT_STATUS_LABELS[a.status]}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Aucun agent. Créez-en un pour ouvrir les dépôts dans un pays.</Empty>
          )}
        </Section>
        {can(actor.role, "agents.manage") && (
          <Section title="Nouvel agent">
            <AgentForm action={createAgentAction} countries={countries} submitLabel="Créer l'agent" />
          </Section>
        )}
      </div>
    </>
  );
}
