import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { ActionForm, Field } from "@/components/action-form";
import { Notice } from "@/components/ui";

export const metadata = { title: "Connexion" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; deconnecte?: string }> }) {
  const { next, deconnecte } = await searchParams;
  return (
    <div className="mx-auto w-full max-w-md px-4 py-12">
      <div className="mb-6 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-linear-to-br from-ink to-accent text-white shadow-lift">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="4.5" y="10" width="15" height="10" rx="2.5" />
            <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
          </svg>
        </div>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink">Connexion</h1>
        <p className="mt-1.5 text-sm text-muted">Pas encore de compte ? <Link href="/inscription" className="font-semibold text-accent">Créer un compte</Link></p>
      </div>
      {deconnecte && <Notice tone="success">Toutes vos sessions ont été fermées.</Notice>}
      <div className="card mt-6 p-6">
        <ActionForm action={loginAction} submitLabel="Se connecter" submitClass="btn-primary w-full py-3">
          <input type="hidden" name="next" value={next ?? ""} />
          <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" required />
          <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
        </ActionForm>
      </div>
    </div>
  );
}
