import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { AGENT_STATUS_LABELS, DEPOSIT_STATUS_LABELS } from "@/lib/domain/deposit";
import { formatDateTime } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { expireStaleDeposits } from "@/lib/services/deposits";
import { PROOF_BUCKET, signedUrl } from "@/lib/storage";
import { agentConfirmAction, agentRejectAction } from "@/app/actions/deposits";
import { ActionForm, Field } from "@/components/action-form";
import { Badge, Empty, KeyValue, Notice, PageHeader, Section, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Espace agent" };

const localMoney = (n: bigint, cur: string) => formatMoney(n, cur === "XOF" || cur === "XAF" ? "FCFA" : cur);

const RESULTS: Record<string, [string, "success" | "info" | "warning"]> = {
  credite: ["Réception confirmée : le portefeuille de l'investisseur est crédité.", "success"],
  "a-valider": ["Réception confirmée : montant élevé, validation financière en cours avant crédit.", "info"],
  rejete: ["Demande rejetée. L'investisseur a été prévenu.", "warning"],
};

export default async function AgentHome({ searchParams }: { searchParams: Promise<{ resultat?: string }> }) {
  const { resultat } = await searchParams;
  const actor = await requireActor("agent.access");
  const agent = await prisma.agent.findUnique({ where: { userId: actor.id }, include: { country: true, paymentMethods: { orderBy: { provider: "asc" } } } });
  if (!agent) return <Notice tone="warning">Votre profil d&apos;agent n&apos;est pas encore configuré. Contactez l&apos;administration.</Notice>;
  await expireStaleDeposits();
  const since = new Date(Date.now() - 30 * 86400_000);
  const [pending, history, month] = await Promise.all([
    prisma.depositRequest.findMany({ where: { agentId: agent.id, status: "AWAITING_AGENT" }, include: { user: true }, orderBy: { createdAt: "asc" } }),
    prisma.depositRequest.findMany({ where: { agentId: agent.id, status: { not: "AWAITING_AGENT" } }, include: { user: true }, orderBy: { updatedAt: "desc" }, take: 30 }),
    prisma.depositRequest.aggregate({ where: { agentId: agent.id, status: "CREDITED", creditedAt: { gte: since } }, _sum: { amountCredited: true }, _count: true }),
  ]);
  const proofs = new Map<string, string | null>();
  for (const d of pending) if (d.proofPath) proofs.set(d.id, await signedUrl(PROOF_BUCKET, d.proofPath));

  return (
    <>
      <PageHeader title={agent.displayName} subtitle={`${agent.country.flag} ${agent.country.name} · ${agent.city}${agent.zone ? ` · ${agent.zone}` : ""}`} />
      {resultat && RESULTS[resultat] && <div className="mb-6"><Notice tone={RESULTS[resultat][1]}>{RESULTS[resultat][0]}</Notice></div>}
      {agent.status !== "ACTIVE" && <div className="mb-6"><Notice tone="warning">Statut : {AGENT_STATUS_LABELS[agent.status]}. Vous ne pouvez pas traiter de demandes.</Notice></div>}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Dépôts à vérifier" value={pending.length} emphasis={pending.length > 0} />
        <Stat label="Crédités (30 jours)" value={month._count} />
        <Stat label="Montant traité (30 jours)" value={formatMoney(month._sum.amountCredited ?? 0n)} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Section title="Dépôts à vérifier">
            <p className="mb-4 text-sm text-muted">Vérifiez la réception réelle des fonds sur votre compte ou auprès de l&apos;opérateur avant de confirmer. Ne confirmez jamais sur la seule base d&apos;une capture d&apos;écran.</p>
            {pending.length ? (
              <ul className="space-y-4">
                {pending.map((d) => (
                  <li key={d.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <div className="text-lg font-bold tabular-nums text-ink">{localMoney(d.amountLocal, d.currency)}</div>
                        <div className="text-sm">{d.provider} · réf. <span className="font-mono font-semibold">{d.payerReference}</span>{d.payerAccount ? ` · depuis ${d.payerAccount}` : ""}</div>
                        <div className="text-xs text-muted">{d.user.firstName} {d.user.lastName} · {d.reference} · déclaré le {formatDateTime(d.createdAt)} · expire le {formatDateTime(d.expiresAt)}</div>
                      </div>
                      {proofs.get(d.id) && <a href={proofs.get(d.id)!} target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-1.5 text-xs">Voir la capture</a>}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <ActionForm action={agentConfirmAction} submitLabel="Fonds reçus — confirmer" submitClass="btn-accent w-full" className="space-y-2"
                        confirm={`Confirmer avoir reçu ${localMoney(d.amountLocal, d.currency)} (réf. ${d.payerReference}) ?`}>
                        <input type="hidden" name="depositId" value={d.id} />
                        <Field label="Référence lue dans votre relevé / application" name="agentReference" required minLength={3}
                          placeholder={`attendue : ${d.payerReference}`} hint="Saisissez-la vous-même après avoir constaté la réception." />
                      </ActionForm>
                      <ActionForm action={agentRejectAction} submitLabel="Rejeter" submitClass="btn-danger w-full" className="space-y-2">
                        <input type="hidden" name="depositId" value={d.id} />
                        <Field label="Motif du rejet" name="reason" required placeholder="Aucun paiement reçu, montant différent…" />
                      </ActionForm>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Aucune demande en attente.</Empty>
            )}
          </Section>

          <Section title="Historique">
            {history.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Date</th><th>Investisseur</th><th>Paiement</th><th className="text-right">Montant</th><th>Statut</th></tr></thead>
                  <tbody>
                    {history.map((d) => (
                      <tr key={d.id}>
                        <td className="whitespace-nowrap text-muted">{formatDateTime(d.updatedAt)}</td>
                        <td>{d.user.firstName} {d.user.lastName}<div className="font-mono text-xs text-muted">{d.reference}</div></td>
                        <td>{d.provider}<div className="font-mono text-xs text-muted">{d.payerReference}</div></td>
                        <td className="text-right tabular-nums whitespace-nowrap">{localMoney(d.amountLocal, d.currency)}</td>
                        <td>{DEPOSIT_STATUS_LABELS[d.status]}{d.rejectReason && <div className="text-xs text-muted">{d.rejectReason}</div>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted">Aucune opération traitée.</p>
            )}
          </Section>
        </div>

        <aside className="space-y-6">
          <Section title="Mes moyens de paiement">
            <ul className="space-y-3 text-sm">
              {agent.paymentMethods.map((m) => (
                <li key={m.id} className="rounded-lg bg-paper p-3">
                  <div className="flex items-center justify-between"><strong>{m.provider}</strong><Badge tone={m.active ? "success" : "neutral"}>{m.active ? "Actif" : "Inactif"}</Badge></div>
                  <div className="font-mono text-xs">{m.accountNumber}</div>
                  <div className="text-xs text-muted">{m.accountName} · {m.currency}</div>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted">Pour modifier vos coordonnées, contactez l&apos;administration.</p>
          </Section>
          <Section title="Profil">
            <KeyValue items={[["Horaires", agent.hours ?? "—"], ["Statut", AGENT_STATUS_LABELS[agent.status]], ["Dépôts", agent.canDeposit ? "Autorisés" : "Non"]]} />
          </Section>
        </aside>
      </div>
    </>
  );
}
