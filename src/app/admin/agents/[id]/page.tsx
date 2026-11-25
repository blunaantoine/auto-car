import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { DEPOSIT_STATUS_LABELS } from "@/lib/domain/deposit";
import { formatDateTime } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { addMethodAction, toggleMethodAction, updateAgentAction } from "@/app/actions/deposits";
import { ActionForm, Field } from "@/components/action-form";
import { AgentForm } from "@/components/agent-form";
import { Badge, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";

const localMoney = (n: bigint, cur: string) => formatMoney(n, cur === "XOF" || cur === "XAF" ? "FCFA" : cur);

export default async function AgentDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor("backoffice.access");
  const [agent, countries] = await Promise.all([
    prisma.agent.findUnique({
      where: { id },
      include: { user: true, country: true, paymentMethods: { orderBy: { createdAt: "asc" } }, deposits: { orderBy: { createdAt: "desc" }, take: 20, include: { user: true } } },
    }),
    prisma.country.findMany({ orderBy: { name: "asc" } }),
  ]);
  if (!agent) notFound();
  const manage = can(actor.role, "agents.manage");

  return (
    <>
      <PageHeader title={agent.displayName} subtitle={`${agent.country.flag} ${agent.country.name} · ${agent.city} · compte ${agent.user.email}`}
        actions={<Link href="/admin/agents" className="btn-ghost">Tous les agents</Link>} />
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Section title="Moyens de paiement">
            <ul className="space-y-3">
              {agent.paymentMethods.map((m) => (
                <li key={m.id} className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line p-3 text-sm">
                  <div>
                    <div className="font-semibold">{m.provider} <span className="font-normal text-muted">· {m.currency}</span></div>
                    <div className="font-mono text-xs">{m.accountNumber} — {m.accountName}</div>
                    <div className="text-xs text-muted">
                      {localMoney(m.minAmount, m.currency)} min{m.maxAmount ? ` · ${localMoney(m.maxAmount, m.currency)} max` : ""} · frais {m.feeBps / 100} %{m.feeFixed ? ` + ${localMoney(m.feeFixed, m.currency)}` : ""}{m.delay ? ` · ${m.delay}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge tone={m.active ? "success" : "neutral"}>{m.active ? "Actif" : "Inactif"}</Badge>
                    {manage && (
                      <ActionForm action={toggleMethodAction} submitLabel={m.active ? "Désactiver" : "Activer"} submitClass="btn-ghost px-2 py-1 text-xs" className="">
                        <input type="hidden" name="methodId" value={m.id} />
                        <input type="hidden" name="agentId" value={agent.id} />
                        <input type="hidden" name="active" value={String(!m.active)} />
                      </ActionForm>
                    )}
                  </div>
                </li>
              ))}
              {!agent.paymentMethods.length && <li className="text-sm text-red-700">Aucun moyen de paiement : l&apos;agent n&apos;est pas proposé aux investisseurs.</li>}
            </ul>
            {manage && (
              <details className="mt-4 rounded-lg bg-paper p-4" open={!agent.paymentMethods.length}>
                <summary className="cursor-pointer text-sm font-semibold text-ink">Ajouter un moyen de paiement</summary>
                <ActionForm action={addMethodAction} submitLabel="Ajouter" className="mt-3 space-y-3">
                  <input type="hidden" name="agentId" value={agent.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Opérateur" name="provider" required placeholder="Flooz, T-Money, Orange Money, banque…" />
                    <Field label="Devise reçue" name="currency" required defaultValue={agent.country.currency} maxLength={3} />
                    <Field label="Nom du bénéficiaire" name="accountName" required />
                    <Field label="Numéro / identifiant de réception" name="accountNumber" required />
                    <Field label="Montant minimum" name="minAmount" inputMode="numeric" required defaultValue="2500" />
                    <Field label="Montant maximum (facultatif)" name="maxAmount" inputMode="numeric" />
                    <Field label="Frais fixes (facultatif)" name="feeFixed" inputMode="numeric" />
                    <Field label="Frais en % (facultatif)" name="feePercent" inputMode="decimal" placeholder="1,5" />
                    <Field label="Délai indicatif" name="delay" placeholder="15 min à 2 h" />
                  </div>
                </ActionForm>
              </details>
            )}
          </Section>

          <Section title="Dernières demandes">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Investisseur</th><th>Référence</th><th className="text-right">Montant</th><th>Statut</th></tr></thead>
                <tbody>
                  {agent.deposits.map((d) => (
                    <tr key={d.id}>
                      <td className="whitespace-nowrap text-muted">{formatDateTime(d.createdAt)}</td>
                      <td>{d.user.firstName} {d.user.lastName}</td>
                      <td className="font-mono text-xs">{d.reference}<div className="text-muted">{d.provider} · {d.payerReference}</div></td>
                      <td className="text-right tabular-nums whitespace-nowrap">{localMoney(d.amountLocal, d.currency)}</td>
                      <td>{DEPOSIT_STATUS_LABELS[d.status]}</td>
                    </tr>
                  ))}
                  {!agent.deposits.length && <tr><td colSpan={5} className="text-muted">Aucune demande.</td></tr>}
                </tbody>
              </table>
            </div>
          </Section>
        </div>
        {manage && (
          <Section title="Profil de l'agent">
            <AgentForm action={updateAgentAction} countries={countries} agent={agent} submitLabel="Enregistrer" />
          </Section>
        )}
      </div>
    </>
  );
}
