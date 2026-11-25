import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { DEPOSIT_STATUS_LABELS } from "@/lib/domain/deposit";
import { formatDateTime } from "@/lib/labels";
import { formatMoney } from "@/lib/money";
import { currentRate, depositAgents } from "@/lib/services/agents";
import { expireStaleDeposits } from "@/lib/services/deposits";
import { getSetting } from "@/lib/services/settings";
import { storageConfigured } from "@/lib/storage";
import { cancelDepositAction } from "@/app/actions/deposits";
import { ActionForm } from "@/components/action-form";
import { DepositForm } from "@/components/deposit-form";
import { Badge, Empty, KeyValue, Notice, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Effectuer un dépôt" };

const localMoney = (n: bigint, cur: string) => formatMoney(n, cur === "XOF" || cur === "XAF" ? "FCFA" : cur);
const tone = (s: string) => (s === "CREDITED" ? "success" : s === "REJECTED" || s === "DISPUTED" ? "danger" : s === "EXPIRED" || s === "CANCELLED" ? "neutral" : "warning");

export default async function DepositPage({ searchParams }: { searchParams: Promise<{ pays?: string; methode?: string; declare?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  await expireStaleDeposits();
  const [countries, mine] = await Promise.all([
    prisma.country.findMany({ where: { active: true }, orderBy: { name: "asc" }, include: { agents: { where: { status: "ACTIVE", canDeposit: true, paymentMethods: { some: { active: true } } }, select: { id: true } } } }),
    prisma.depositRequest.findMany({ where: { userId: user.id }, include: { agent: true }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);
  const country = sp.pays ?? user.countryCode;
  const agents = await depositAgents(country);
  const method = sp.methode ? agents.flatMap((a) => a.paymentMethods.map((m) => ({ ...m, agent: a }))).find((m) => m.id === sp.methode) : undefined;
  const rate = method ? await currentRate(method.currency) : null;
  const minCredited = await getSetting("MIN_DEPOSIT");

  return (
    <>
      <PageHeader title="Effectuer un dépôt" subtitle="Par un agent local de votre pays. Votre portefeuille est crédité après vérification de la réception des fonds." />
      {sp.declare && <div className="mb-6"><Notice tone="success">Dépôt déclaré. L&apos;agent va vérifier la réception ; vous serez notifié dès le crédit.</Notice></div>}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Section title="1. Votre pays">
            <div className="flex flex-wrap gap-2">
              {countries.map((c) => (
                <Link key={c.code} href={`/espace/depot?pays=${c.code}`} aria-current={c.code === country ? "true" : undefined}
                  className={`rounded-full px-3 py-1.5 text-sm ring-1 ring-inset ${c.code === country ? "bg-ink text-white ring-ink" : "bg-white ring-line hover:bg-paper"}`}>
                  {c.flag} {c.name} <span className="opacity-70">{c.dialCode}</span>
                  {c.agents.length === 0 && <span className="ml-1 text-xs opacity-70">· bientôt</span>}
                </Link>
              ))}
            </div>
          </Section>

          <Section title="2. Un agent et un moyen de paiement">
            {agents.length ? (
              <ul className="space-y-4">
                {agents.map((a) => (
                  <li key={a.id} className="rounded-lg border border-line p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="font-semibold text-ink">{a.displayName}</div>
                      <div className="text-xs text-muted">{a.city}{a.zone ? ` · ${a.zone}` : ""}{a.hours ? ` · ${a.hours}` : ""}</div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {a.paymentMethods.map((m) => (
                        <Link key={m.id} href={`/espace/depot?pays=${country}&methode=${m.id}`}
                          className={`rounded-lg px-3 py-2 text-sm ring-1 ring-inset ${m.id === method?.id ? "bg-accent text-white ring-accent" : "bg-white ring-line hover:bg-paper"}`}>
                          <div className="font-medium">{m.provider}</div>
                          <div className="text-xs opacity-80">
                            {m.feeBps || m.feeFixed ? `Frais ${m.feeBps ? `${m.feeBps / 100} %` : ""}${m.feeBps && m.feeFixed ? " + " : ""}${m.feeFixed ? localMoney(m.feeFixed, m.currency) : ""}` : "Sans frais"}
                            {m.delay ? ` · ${m.delay}` : ""}
                          </div>
                        </Link>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>Aucun agent n&apos;est encore disponible dans ce pays. Contactez l&apos;assistance.</Empty>
            )}
          </Section>

          {method && (
            <Section title="3. Envoyez le paiement">
              <p className="mb-3 text-sm text-gray-700">Effectuez le transfert depuis votre application ou votre opérateur vers :</p>
              <KeyValue items={[
                ["Opérateur", method.provider],
                ["Bénéficiaire", method.accountName],
                ["Numéro / identifiant", <span key="n" className="font-mono">{method.accountNumber}</span>],
                ["Devise", method.currency],
                ["Montant", `${localMoney(method.minAmount, method.currency)} minimum${method.maxAmount ? ` · ${localMoney(method.maxAmount, method.currency)} maximum` : ""}`],
                ["Délai indicatif", method.delay ?? "—"],
                ["Agent", `${method.agent.displayName} — ${method.agent.city}`],
              ]} />
              {method.agent.instructions && <div className="mt-3"><Notice>{method.agent.instructions}</Notice></div>}
              <p className="mt-3 text-xs text-muted">Indiquez la référence {`IG-${user.id.slice(-8).toUpperCase()}`} dans le motif du transfert si votre opérateur le permet.</p>
            </Section>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-20 lg:self-start">
          {method && rate ? (
            <Section title="4. Déclarez votre dépôt">
              <DepositForm
                methodId={method.id}
                currency={method.currency}
                min={method.minAmount.toString()}
                max={method.maxAmount?.toString() ?? null}
                feeFixed={method.feeFixed.toString()}
                feeBps={method.feeBps}
                rate={rate.rate}
                rateSource={rate.source}
                minCredited={minCredited}
                proofEnabled={storageConfigured()}
              />
            </Section>
          ) : (
            <Notice>Choisissez un pays, puis un moyen de paiement chez un agent pour voir ses coordonnées.</Notice>
          )}
        </aside>
      </div>

      <div className="mt-8">
        <Section title="Mes dépôts">
          {mine.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Référence</th><th>Agent</th><th className="text-right">Envoyé</th><th className="text-right">Crédité</th><th>Statut</th><th></th></tr></thead>
                <tbody>
                  {mine.map((d) => (
                    <tr key={d.id}>
                      <td className="whitespace-nowrap text-muted">{formatDateTime(d.createdAt)}</td>
                      <td className="font-mono text-xs">{d.reference}<div className="text-muted">{d.provider} · {d.payerReference}</div></td>
                      <td>{d.agent.displayName}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{localMoney(d.amountLocal, d.currency)}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{formatMoney(d.amountCredited)}</td>
                      <td>
                        <Badge tone={tone(d.status)}>{DEPOSIT_STATUS_LABELS[d.status]}</Badge>
                        {d.rejectReason && <div className="mt-1 text-xs text-red-700">{d.rejectReason}</div>}
                      </td>
                      <td>
                        {d.status === "AWAITING_AGENT" && (
                          <ActionForm action={cancelDepositAction} submitLabel="Annuler" submitClass="btn-ghost px-2 py-1 text-xs" confirm="Annuler cette déclaration ?">
                            <input type="hidden" name="depositId" value={d.id} />
                          </ActionForm>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-muted">Aucun dépôt pour l&apos;instant.</p>
          )}
        </Section>
      </div>
    </>
  );
}
