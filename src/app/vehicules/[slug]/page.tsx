import Link from "next/link";
import { notFound } from "next/navigation";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import { PUBLIC_STATUSES } from "@/lib/domain/operation-status";
import { LOSS_RULE_LABELS } from "@/lib/domain/profit-sharing";
import { EXPENSE_CATEGORY_LABELS, formatDate } from "@/lib/labels";
import { formatMoney, percent } from "@/lib/money";
import { getLossRule, getSetting } from "@/lib/services/settings";
import { getWalletSummary } from "@/lib/services/wallet";
import { CarPlaceholder, KeyValue, Notice, Progress, Section, StatusBadge } from "@/components/ui";
import { InvestForm } from "@/components/invest-form";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const op = await prisma.operation.findUnique({ where: { slug }, select: { title: true } });
  return { title: op?.title ?? "Véhicule" };
}

export default async function VehiclePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const op = await prisma.operation.findUnique({
    where: { slug },
    include: { vehicle: true, budgetLines: true, updates: { orderBy: { createdAt: "desc" } }, closure: true, _count: { select: { investments: true } } },
  });
  if (!op || !PUBLIC_STATUSES.includes(op.status)) notFound();

  const user = await getCurrentUser();
  const [lossRule, globalMin] = await Promise.all([getLossRule(), getSetting("MIN_INVESTMENT").then(BigInt)]);
  const min = op.minInvestment > globalMin ? op.minInvestment : globalMin;
  const remaining = op.investorTarget - op.investorFunded;
  const wallet = user ? await getWalletSummary(user.id) : null;
  const myInvestments = user ? await prisma.investment.findMany({ where: { userId: user.id, operationId: op.id } }) : [];
  const myTotal = myInvestments.reduce((a, i) => a + i.amount, 0n);
  const v = op.vehicle;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link href="/vehicules" className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-muted shadow-xs ring-1 ring-inset ring-line transition hover:text-ink">← Catalogue</Link>
      <div className="mt-4 mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-[1.65rem] font-extrabold leading-tight tracking-tight text-ink sm:text-3xl">{op.title}</h1>
        <StatusBadge status={op.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <div className="grid gap-3 overflow-hidden rounded-2xl">
            <div className="aspect-[16/9] overflow-hidden rounded-2xl bg-gray-100 ring-1 ring-line/70">
              {v.photos[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.photos[0]} alt={`${v.make} ${v.model}`} className="h-full w-full object-cover" />
              ) : (
                <CarPlaceholder label={`${v.make} ${v.model}`} />
              )}
            </div>
            {v.photos.length > 1 && (
              <div className="grid grid-cols-4 gap-3">
                {v.photos.slice(1, 5).map((p) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={p} src={p} alt="" className="aspect-[4/3] w-full rounded-xl object-cover ring-1 ring-line/70" />
                ))}
              </div>
            )}
          </div>

          <Section title="Le véhicule">
            <KeyValue items={[
              ["Marque et modèle", `${v.make} ${v.model}`],
              ["Année", v.year ?? "Non connue"],
              ["État", v.condition],
              ["Localisation", v.location],
              ["Durée estimée (indicative)", op.estimatedDurationDays ? `${op.estimatedDurationDays} jours — sans garantie` : "Non communiquée"],
            ]} />
            <h3 className="mt-5 mb-1 text-sm font-semibold text-ink">Dommages constatés</h3>
            <p className="text-sm whitespace-pre-line text-gray-700">{v.damageDescription}</p>
            <h3 className="mt-5 mb-1 text-sm font-semibold text-ink">Description de l&apos;opération</h3>
            <p className="text-sm whitespace-pre-line text-gray-700">{op.description}</p>
          </Section>

          <Section title="Budget prévisionnel">
            {op.budgetLines.length > 0 ? (
              <KeyValue items={[
                ...op.budgetLines.map((l) => [EXPENSE_CATEGORY_LABELS[l.category], formatMoney(l.amount)] as [string, string]),
                ["Total", formatMoney(op.acquisitionBudget)],
              ]} />
            ) : (
              <KeyValue items={[["Budget total", formatMoney(op.acquisitionBudget)]]} />
            )}
            <p className="mt-3 text-xs text-muted">Prévisionnel : les dépenses réelles sont enregistrées avec justificatifs et figurent dans le récapitulatif de clôture.</p>
          </Section>

          <Section title="Risques">
            <p className="text-sm whitespace-pre-line text-gray-700">{op.risks}</p>
            <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-gray-700">
              <li>Retard, surcoût ou impossibilité de réparation.</li>
              <li>Baisse du prix de revente ou absence d&apos;acheteur.</li>
              <li>Perte partielle ou totale du capital investi.</li>
            </ul>
            <div className="mt-4"><Notice tone="warning">
              <strong>Traitement des pertes :</strong> {LOSS_RULE_LABELS[lossRule]}.
            </Notice></div>
          </Section>

          {op.status === "CLOSED" && op.closure && (
            <Section title="Résultat constaté">
              <KeyValue items={[
                ["Prix de vente", formatMoney(op.closure.revenue)],
                ["Coûts réels approuvés", formatMoney(op.closure.totalCosts)],
                ["Résultat net", formatMoney(op.closure.netResult)],
                ["Part conservée par l'entreprise", formatMoney(op.closure.companyFinalShare)],
                ["Enveloppe des particuliers", formatMoney(op.closure.investorsEnvelope)],
              ]} />
            </Section>
          )}

          <Section title="Mises à jour">
            {op.updates.length ? (
              <ol className="space-y-4">
                {op.updates.map((u) => (
                  <li key={u.id} className="relative border-l-2 border-accent/40 pl-4">
                    <span aria-hidden className="absolute -left-[7px] top-1.5 h-3 w-3 rounded-full border-2 border-accent bg-white" />
                    <div className="text-xs text-muted">{formatDate(u.createdAt)}</div>
                    <div className="font-semibold text-ink">{u.title}</div>
                    <p className="text-sm whitespace-pre-line text-gray-700">{u.body}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted">Aucune mise à jour publiée pour l&apos;instant.</p>
            )}
          </Section>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-24 lg:self-start">
          <div className="card space-y-4">
            <div>
              <div className="flex justify-between text-sm">
                <span className="text-muted">Financé par les particuliers</span>
                <span className="font-semibold">{percent(op.investorFunded, op.investorTarget)} %</span>
              </div>
              <div className="mt-2"><Progress value={op.investorFunded} max={op.investorTarget} /></div>
            </div>
            <KeyValue items={[
              ["Recherché auprès des particuliers", formatMoney(op.investorTarget)],
              ["Déjà financé", formatMoney(op.investorFunded)],
              ["Reste à financer", formatMoney(remaining)],
              ["Contribution de l'entreprise", formatMoney(op.companyContribution)],
              ["Minimum par investissement", formatMoney(min)],
              ...(op.maxPerInvestor ? [["Plafond par investisseur", formatMoney(op.maxPerInvestor)] as [string, string]] : []),
              ["Participants", op._count.investments],
            ]} />
            {myTotal > 0n && <Notice tone="success">Vous avez investi {formatMoney(myTotal)} dans cette opération.</Notice>}
          </div>

          {op.status === "FUNDING_OPEN" && (
            <div className="card">
              <h2 className="mb-3 text-lg font-semibold text-ink">Investir</h2>
              {!user ? (
                <div className="space-y-3 text-sm">
                  <p className="text-muted">Créez un compte et alimentez votre portefeuille pour participer.</p>
                  <Link href={`/connexion?next=/vehicules/${op.slug}`} className="btn-primary w-full">Se connecter</Link>
                  <Link href="/inscription" className="btn-ghost w-full">Créer un compte</Link>
                </div>
              ) : !user.emailVerifiedAt || user.status !== "ACTIVE" ? (
                <Notice tone="warning">Votre compte doit être vérifié pour investir. <Link href="/verification" className="font-semibold underline">Vérifier mon compte</Link></Notice>
              ) : wallet!.available < min ? (
                <Notice>Votre solde disponible ({formatMoney(wallet!.available)}) est inférieur au minimum. <Link href="/espace/depot" className="font-semibold underline">Alimenter mon portefeuille</Link></Notice>
              ) : (
                <InvestForm
                  operationId={op.id}
                  idempotencyKey={randomUUID()}
                  min={min.toString()}
                  remaining={(op.maxPerInvestor && op.maxPerInvestor - myTotal < remaining ? op.maxPerInvestor - myTotal : remaining).toString()}
                  balance={wallet!.available.toString()}
                  companyContribution={op.companyContribution.toString()}
                  investorTarget={op.investorTarget.toString()}
                />
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
