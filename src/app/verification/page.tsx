import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { resendCodeAction, verifyAction } from "@/app/actions/auth";
import { issueCode } from "@/lib/services/auth";
import { ActionForm, Field } from "@/components/action-form";
import { Notice } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Vérifier mon compte" };

// Affiche le code à l'écran : développement, ou déploiement de TEST sans fournisseur e-mail.
// Ne jamais activer sur l'environnement de production réel.
const showCodes = process.env.DEV_SHOW_VERIFICATION_CODES === "true";

export default async function Verify() {
  const user = await requireUser();
  if (user.emailVerifiedAt) redirect("/espace");

  // Mode développement : pas de fournisseur e-mail branché, on affiche un code de test.
  let devCode: string | null = null;
  if (showCodes) {
    devCode = await issueCode(user.id, "EMAIL");
  }

  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-ink">Vérifiez votre adresse e-mail</h1>
      <p className="mt-2 text-sm text-muted">Un code à 6 chiffres a été envoyé à <strong>{user.email}</strong>. Il est valable 15 minutes.</p>
      {showCodes && (
        <div className="mt-4"><Notice tone="warning">
          Environnement de test : aucun e-mail n&apos;est envoyé. Votre code de test est{" "}
          <strong className="font-mono">{devCode}</strong> (il est aussi écrit dans la console du serveur).
        </Notice></div>
      )}
      <div className="card mt-6 space-y-4">
        <ActionForm action={verifyAction} submitLabel="Vérifier" submitClass="btn-primary w-full">
          <Field label="Code de vérification" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
        </ActionForm>
        <ActionForm action={resendCodeAction} submitLabel="Renvoyer un code" submitClass="btn-ghost w-full" />
      </div>
    </div>
  );
}
