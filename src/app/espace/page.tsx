import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { getWalletHistory, getWalletSummary } from "@/lib/services/wallet";
import { formatDateTime, TX_TYPE_LABELS } from "@/lib/labels";
import { formatMoney, formatSigned } from "@/lib/money";
import { markNotificationsReadAction } from "@/app/actions/investor";
import { Empty, Notice, PageHeader, Section, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mon portefeuille" };

export default async function WalletPage({ searchParams }: { searchParams: Promise<{ bienvenue?: string }> }) {
  const { bienvenue } = await searchParams;
  const user = await requireUser();
  const [summary, history, notifications] = await Promise.all([
    getWalletSummary(user.id),
    getWalletHistory(user.id),
    prisma.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  const unread = notifications.filter((n) => !n.readAt).length;
  const depositRef = `IG-${user.id.slice(-8).toUpperCase()}`;

  return (
    <>
      <PageHeader title={`Bonjour ${user.firstName}`} subtitle="Votre portefeuille interne : chaque mouvement correspond à une écriture comptable traçable." actions={<Link href="/vehicules" className="btn-accent">Investir</Link>} />
      {bienvenue && <div className="mb-6"><Notice tone="success">Votre compte est vérifié. Alimentez votre portefeuille pour commencer à investir.</Notice></div>}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Solde disponible" value={formatMoney(summary.available)} hint="Investissable immédiatement" emphasis />
        <Stat label="Montants investis" value={formatMoney(summary.invested)} hint="Opérations en cours" />
        <Stat label="Réclamables" value={formatMoney(summary.claimable)} hint={summary.claimable > 0n ? <Link href="/espace/gains" className="font-semibold text-accent">Réclamer →</Link> : "Après clôture validée"} />
        <Stat label="En attente" value={formatMoney(summary.pending)} hint="Dépôts non confirmés : non investissables" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_340px]">
        <Section title="Historique des mouvements">
          {history.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Type</th><th>Motif</th><th>Référence</th><th className="text-right">Montant</th></tr></thead>
                <tbody>
                  {history.map((e) => (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap text-muted">{formatDateTime(e.createdAt)}</td>
                      <td>{TX_TYPE_LABELS[e.transaction.type]}</td>
                      <td>{e.memo ?? e.transaction.description}<div className="text-xs text-muted">{e.transaction.description}</div></td>
                      <td className="font-mono text-xs">{e.transaction.reference}</td>
                      <td className={`text-right font-semibold tabular-nums whitespace-nowrap ${e.amount < 0n ? "text-red-700" : "text-emerald-700"}`}>{formatSigned(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <Empty>Aucun mouvement pour l&apos;instant.</Empty>
          )}
        </Section>

        <div className="space-y-6">
          <Section title="Alimenter mon portefeuille">
            <div className="space-y-3 text-sm text-gray-700">
              <p>Dépôt minimum : <strong>2 500 FCFA</strong>. Votre référence de dépôt personnelle :</p>
              <p className="rounded-lg bg-paper px-3 py-2 text-center font-mono text-lg font-bold tracking-wider text-ink">{depositRef}</p>
              <p>Indiquez-la dans le motif de votre transfert, puis transmettez la référence de transaction à l&apos;assistance. Le portefeuille est crédité uniquement après vérification de la réception effective des fonds.</p>
              <p className="text-xs text-muted">Les dépôts et retraits par agents locaux dans votre pays arrivent prochainement.</p>
            </div>
          </Section>

          <Section title={`Notifications${unread ? ` (${unread})` : ""}`} actions={unread ? <form action={markNotificationsReadAction}><button className="text-xs font-semibold text-accent">Tout marquer lu</button></form> : null}>
            {notifications.length ? (
              <ul className="space-y-3">
                {notifications.map((n) => (
                  <li key={n.id} className={`text-sm ${n.readAt ? "text-muted" : ""}`}>
                    <div className="flex items-center gap-2 font-medium text-ink">{!n.readAt && <span className="h-2 w-2 rounded-full bg-accent" aria-label="non lue" />}{n.link ? <Link href={n.link} className="hover:underline">{n.title}</Link> : n.title}</div>
                    <p>{n.body}</p>
                    <div className="text-xs text-muted">{formatDateTime(n.createdAt)}</div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">Aucune notification.</p>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
