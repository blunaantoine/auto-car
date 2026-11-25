import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { changePasswordAction, logoutAllAction } from "@/app/actions/auth";
import { ActionForm, Field } from "@/components/action-form";
import { formatDateTime } from "@/lib/labels";
import { Badge, KeyValue, PageHeader, Section } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sécurité" };

export default async function Security() {
  const user = await requireUser();
  const [country, events, sessions] = await Promise.all([
    prisma.country.findUnique({ where: { code: user.countryCode } }),
    prisma.loginEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.session.count({ where: { userId: user.id, expiresAt: { gt: new Date() } } }),
  ]);
  return (
    <>
      <PageHeader title="Profil et sécurité" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Mon profil">
          <KeyValue items={[
            ["Nom", `${user.firstName} ${user.lastName}`],
            ["E-mail", user.email],
            ["Téléphone", user.phone ?? "—"],
            ["Pays de résidence", country ? `${country.flag} ${country.name}` : user.countryCode],
            ["Ville", user.city ?? "—"],
            ["Compte vérifié le", formatDateTime(user.emailVerifiedAt)],
          ]} />
        </Section>
        <Section title="Changer mon mot de passe">
          <ActionForm action={changePasswordAction} submitLabel="Modifier le mot de passe">
            <Field label="Mot de passe actuel" name="current" type="password" autoComplete="current-password" required />
            <Field label="Nouveau mot de passe" name="next" type="password" autoComplete="new-password" required minLength={10} hint="10 caractères minimum, avec des lettres et des chiffres." />
            <Field label="Confirmer le nouveau mot de passe" name="confirm" type="password" autoComplete="new-password" required />
          </ActionForm>
        </Section>
        <Section title="Sessions">
          <p className="text-sm text-muted">{sessions} session(s) active(s). En cas de doute, fermez toutes les sessions : vous devrez vous reconnecter sur chaque appareil.</p>
          <form action={logoutAllAction} className="mt-4"><button className="btn-danger">Déconnecter toutes les sessions</button></form>
        </Section>
        <Section title="Historique des connexions">
          <ul className="divide-y divide-line text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex items-center justify-between gap-2 py-2">
                <span>{formatDateTime(e.createdAt)} <span className="text-xs text-muted">{e.ip ?? ""}</span></span>
                <Badge tone={e.success ? "success" : "danger"}>{e.success ? "Réussie" : "Échouée"}</Badge>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
