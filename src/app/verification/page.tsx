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
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-ink to-accent text-white shadow-lift">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 2.8 19 5.3v5.5c0 4.4-2.9 7.8-7 9.7-4.1-1.9-7-5.3-7-9.7V5.3Z" />
            <path d="m9.2 11.8 1.9 1.9 3.6-3.9" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Vérifiez votre adresse e-mail</h1>
        <p className="mt-1.5 text-sm text-muted">Un code à 6 chiffres a été envoyé à <strong>{user.email}</strong>. Il est valable 15 minutes.</p>
      </div>
      {showCodes && (
        <div className="mt-4"><Notice tone="warning">
          Environnement de test : aucun e-mail n&apos;est envoyé. Votre code de test est{" "}
          <strong className="font-mono">{devCode}</strong> (il est aussi écrit dans la console du serveur).
        </Notice></div>
      )}
      <div className="card mt-6 space-y-4 p-6">
        <ActionForm action={verifyAction} submitLabel="Vérifier" submitClass="btn-primary w-full">
          <Field label="Code de vérification" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required />
        </ActionForm>
        <ActionForm action={resendCodeAction} submitLabel="Renvoyer un code" submitClass="btn-ghost w-full" />
      </div>
    </div>
  );
}
