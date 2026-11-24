import Link from "next/link";
import { loginAction } from "@/app/actions/auth";
import { ActionForm, Field } from "@/components/action-form";
import { Notice } from "@/components/ui";

export const metadata = { title: "Connexion" };

export default async function Login({ searchParams }: { searchParams: Promise<{ next?: string; deconnecte?: string }> }) {
  const { next, deconnecte } = await searchParams;
  return (
    <div className="mx-auto max-w-md px-4 py-12">
      <h1 className="text-2xl font-bold text-ink">Connexion</h1>
      <p className="mt-1 text-sm text-muted">Pas encore de compte ? <Link href="/inscription" className="font-semibold text-accent">Créer un compte</Link></p>
      {deconnecte && <div className="mt-4"><Notice tone="success">Toutes vos sessions ont été fermées.</Notice></div>}
      <div className="card mt-6">
        <ActionForm action={loginAction} submitLabel="Se connecter" submitClass="btn-primary w-full">
          <input type="hidden" name="next" value={next ?? ""} />
          <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" required />
          <Field label="Mot de passe" name="password" type="password" autoComplete="current-password" required />
        </ActionForm>
      </div>
    </div>
  );
}
