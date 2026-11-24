import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { formatDate, SETTLEMENT_STATUS_LABELS } from "@/lib/labels";
import { formatMoney, formatSigned } from "@/lib/money";
import { LOSS_RULE_LABELS, type LossRule } from "@/lib/domain/profit-sharing";
import { claimAction } from "@/app/actions/investor";
import { ActionForm } from "@/components/action-form";
import { Badge, Empty, KeyValue, Notice, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mes gains" };

export default async function Gains({ searchParams }: { searchParams: Promise<{ credite?: string }> }) {
  const { credite } = await searchParams;
  const user = await requireUser();
  const settlements = await prisma.investorSettlement.findMany({
    where: { userId: user.id, status: { in: ["CLAIMABLE", "CLAIMED"] } },
    include: { closure: { include: { operation: true } }, investment: true },
    orderBy: [{ status: "asc" }, { closure: { validatedAt: "desc" } }],
  });
  return (
    <>
      <PageHeader title="Mes gains" subtitle="Disponible après la clôture financière validée de chaque opération." />
      {credite && <div className="mb-6"><Notice tone="success">Montant crédité sur votre portefeuille. Vous pouvez le réinvestir ou demander un retrait.</Notice></div>}
      {settlements.length ? (
        <div className="space-y-4">
          {settlements.map((s) => {
            const c = s.closure;
            return (
              <article key={s.id} className="card grid gap-5 md:grid-cols-[1fr_300px]">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/vehicules/${c.operation.slug}`} className="text-lg font-semibold text-ink hover:underline">{c.operation.title}</Link>
                    <Badge tone={s.status === "CLAIMED" ? "neutral" : "success"}>{SETTLEMENT_STATUS_LABELS[s.status]}</Badge>
                  </div>
                  <details className="mt-3 text-sm">
                    <summary className="cursor-pointer font-medium text-accent">Détail du calcul</summary>
                    <div className="mt-3">
                      <KeyValue items={[
                        ["Prix de vente", formatMoney(c.revenue)],
                        ["Coûts réels approuvés", formatMoney(c.totalCosts)],
                        ["Bénéfice net distribuable (B)", formatMoney(c.netResult)],
                        ["Contribution de l'entreprise (E)", formatMoney(c.companyContribution)],
                        ["Contributions des particuliers (P)", formatMoney(c.investorsTotal)],
                        ["Part théorique de l'entreprise", formatMoney(c.companyTheoreticalShare)],
                        ["Part conservée par l'entreprise", formatMoney(c.companyFinalShare)],
                        ["Enveloppe des particuliers", formatMoney(c.investorsEnvelope)],
                        ["Votre apport (I)", formatMoney(s.capital)],
                        ["Votre part : enveloppe × I / P", formatSigned(s.result)],
                      ]} />
                      <p className="mt-2 text-xs text-muted">Formule {c.formulaVersion} · règle de perte : {LOSS_RULE_LABELS[c.lossRule as LossRule] ?? c.lossRule} · clôture validée le {formatDate(c.validatedAt)}</p>
                    </div>
                  </details>
                </div>
                <div className="space-y-3 rounded-lg bg-paper p-4">
                  <KeyValue items={[
                    ["Capital initial", formatMoney(s.capital)],
                    [s.result >= 0n ? "Bénéfice" : "Perte", <span key="r" className={s.result < 0n ? "text-red-700" : "text-emerald-700"}>{formatSigned(s.result)}</span>],
                    ["Frais", formatMoney(0n)],
                    ["Total récupérable", <strong key="t" className="text-ink">{formatMoney(s.claimable)}</strong>],
                  ]} />
                  {s.status === "CLAIMABLE" ? (
                    <ActionForm action={claimAction} submitLabel="Réclamer mon capital et mes gains" submitClass="btn-accent w-full" confirm={`Créditer ${formatMoney(s.claimable)} sur votre portefeuille ?`}>
                      <input type="hidden" name="settlementId" value={s.id} />
                    </ActionForm>
                  ) : (
                    <p className="text-center text-sm text-muted">Crédité le {formatDate(s.claimedAt)}</p>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : (
        <Empty>Aucun gain disponible. Les montants apparaissent ici dès qu&apos;une opération à laquelle vous participez est clôturée.</Empty>
      )}
    </>
  );
}
