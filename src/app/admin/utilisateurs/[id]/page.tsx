import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { can, ROLE_LABELS } from "@/lib/auth/permissions";
import { formatDateTime, TX_TYPE_LABELS } from "@/lib/labels";
import { formatMoney, formatSigned } from "@/lib/money";
import { getWalletHistory, getWalletSummary } from "@/lib/services/wallet";
import { creditDepositAction, resetPasswordAction, updateProfileAction, userRoleAction, userStatusAction, verifyUserAction } from "@/app/actions/admin";
import { ActionForm, Field, TextArea } from "@/components/action-form";
import { KeyValue, PageHeader, Section, Stat } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function UserDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor("backoffice.access");
  const user = await prisma.user.findUnique({ where: { id }, include: { country: true, investments: { include: { operation: true }, orderBy: { createdAt: "desc" } } } });
  if (!user) notFound();
  const [summary, history, countries] = await Promise.all([
    getWalletSummary(id),
    getWalletHistory(id, 30),
    prisma.country.findMany({ orderBy: { name: "asc" } }),
  ]);
  // Un administrateur gère les investisseurs ; le personnel est géré par un super administrateur.
  const canManage = can(actor.role, "users.manage") && (user.role === "INVESTOR" || can(actor.role, "staff.manage"));

  return (
    <>
      <PageHeader title={`${user.firstName} ${user.lastName}`} subtitle={`${user.email} · ${ROLE_LABELS[user.role]} · référence de dépôt IG-${user.id.slice(-8).toUpperCase()}`} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Solde disponible" value={formatMoney(summary.available)} emphasis />
        <Stat label="Investi" value={formatMoney(summary.invested)} />
        <Stat label="Réclamable" value={formatMoney(summary.claimable)} />
      </div>
      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Section title="Profil">
            <KeyValue items={[
              ["Pays", `${user.country.flag} ${user.country.name}`],
              ["Ville", user.city ?? "—"],
              ["Téléphone", user.phone ?? "—"],
              ["E-mail vérifié", formatDateTime(user.emailVerifiedAt)],
              ["Statut", user.status + (user.suspendedReason ? ` — ${user.suspendedReason}` : "")],
              ["Inscription", formatDateTime(user.createdAt)],
            ]} />
          </Section>
          <Section title="Mouvements du portefeuille (lecture seule)">
            <div className="table-wrap">
              <table className="table">
                <thead><tr><th>Date</th><th>Type</th><th>Référence</th><th className="text-right">Montant</th></tr></thead>
                <tbody>
                  {history.map((e) => (
                    <tr key={e.id}>
                      <td className="text-muted whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                      <td>{TX_TYPE_LABELS[e.transaction.type]}<div className="text-xs text-muted">{e.transaction.description}</div></td>
                      <td className="font-mono text-xs">{e.transaction.reference}</td>
                      <td className="text-right tabular-nums whitespace-nowrap">{formatSigned(e.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
          <Section title="Investissements">
            <ul className="divide-y divide-line text-sm">
              {user.investments.map((i) => (
                <li key={i.id} className="flex justify-between gap-2 py-2"><span>{i.operation.title} <span className="text-xs text-muted">({i.status})</span></span><span className="tabular-nums">{formatMoney(i.amount)}</span></li>
              ))}
              {!user.investments.length && <li className="text-muted">Aucun investissement.</li>}
            </ul>
          </Section>
        </div>
        <aside className="space-y-6">
          {can(actor.role, "wallet.credit") && (
            <Section title="Créditer un dépôt reçu">
              <ActionForm action={creditDepositAction} submitLabel="Créditer" confirm="Confirmez-vous avoir vérifié la réception effective des fonds ?">
                <input type="hidden" name="userId" value={user.id} />
                <Field label="Montant reçu (FCFA)" name="amount" inputMode="numeric" required />
                <Field label="Référence de la transaction externe" name="externalReference" required hint="Une même référence ne peut être créditée qu'une fois." />
                <TextArea label="Motif / vérification effectuée" name="reason" rows={2} required />
                <p className="text-xs text-muted">Ne jamais créditer sur la seule base d&apos;une capture d&apos;écran : vérifiez la réception auprès de l&apos;opérateur.</p>
              </ActionForm>
            </Section>
          )}
          {canManage && (
            <Section title="Modifier le profil">
              <ActionForm action={updateProfileAction} submitLabel="Enregistrer">
                <input type="hidden" name="userId" value={user.id} />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Prénom" name="firstName" defaultValue={user.firstName} required />
                  <Field label="Nom" name="lastName" defaultValue={user.lastName} required />
                </div>
                <Field label="E-mail" name="email" type="email" defaultValue={user.email} required />
                <Field label="Téléphone" name="phone" defaultValue={user.phone ?? ""} />
                <div>
                  <label className="label" htmlFor="countryCode">Pays</label>
                  <select id="countryCode" name="countryCode" defaultValue={user.countryCode} className="input">
                    {countries.map((c) => <option key={c.code} value={c.code}>{c.flag} {c.name}</option>)}
                  </select>
                </div>
                <Field label="Ville" name="city" defaultValue={user.city ?? ""} />
                <TextArea label="Motif" name="reason" rows={2} required />
              </ActionForm>
            </Section>
          )}
          {canManage && !user.emailVerifiedAt && user.id !== actor.id && (
            <Section title="Vérifier le compte manuellement">
              <ActionForm action={verifyUserAction} submitLabel="Marquer comme vérifié">
                <input type="hidden" name="userId" value={user.id} />
                <TextArea label="Motif / vérification effectuée" name="reason" rows={2} required />
              </ActionForm>
            </Section>
          )}
          {can(actor.role, "staff.manage") && user.id !== actor.id && (
            <Section title="Réinitialiser le mot de passe">
              <ActionForm action={resetPasswordAction} submitLabel="Générer un mot de passe temporaire" submitClass="btn-danger"
                confirm="Générer un nouveau mot de passe ? L'ancien ne fonctionnera plus et toutes les sessions de ce compte seront fermées.">
                <input type="hidden" name="userId" value={user.id} />
                <TextArea label="Motif" name="reason" rows={2} required />
              </ActionForm>
            </Section>
          )}
          {canManage && user.id !== actor.id && (
            <Section title={user.status === "SUSPENDED" ? "Réactiver le compte" : "Suspendre le compte"}>
              <ActionForm action={userStatusAction} submitLabel={user.status === "SUSPENDED" ? "Réactiver" : "Suspendre"} submitClass={user.status === "SUSPENDED" ? "btn-primary" : "btn-danger"}>
                <input type="hidden" name="userId" value={user.id} />
                <input type="hidden" name="status" value={user.status === "SUSPENDED" ? "ACTIVE" : "SUSPENDED"} />
                <TextArea label="Motif" name="reason" rows={2} required />
              </ActionForm>
            </Section>
          )}
          {can(actor.role, "roles.manage") && user.id !== actor.id && (
            <Section title="Rôle">
              <ActionForm action={userRoleAction} submitLabel="Modifier le rôle">
                <input type="hidden" name="userId" value={user.id} />
                <select name="role" defaultValue={user.role} className="input">
                  {(["INVESTOR", "ADMIN", "FINANCE", "SUPER_ADMIN"] as const).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                </select>
                <TextArea label="Motif" name="reason" rows={2} required />
              </ActionForm>
            </Section>
          )}
        </aside>
      </div>
    </>
  );
}
