import Link from "next/link";
import { prisma } from "@/lib/db";
import { registerAction } from "@/app/actions/auth";
import { ActionForm, Field } from "@/components/action-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Créer un compte" };

export default async function Register() {
  const countries = await prisma.country.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <h1 className="text-2xl font-bold text-ink">Créer un compte</h1>
      <p className="mt-1 text-sm text-muted">Déjà inscrit ? <Link href="/connexion" className="font-semibold text-accent">Se connecter</Link></p>
      <div className="card mt-6">
        <ActionForm action={registerAction} submitLabel="Créer mon compte" submitClass="btn-primary w-full">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Prénom" name="firstName" autoComplete="given-name" required />
            <Field label="Nom" name="lastName" autoComplete="family-name" required />
          </div>
          <Field label="Adresse e-mail" name="email" type="email" autoComplete="email" required />
          <Field label="Téléphone (facultatif)" name="phone" type="tel" autoComplete="tel" placeholder="+228 90 00 00 00" />
          <div>
            <label htmlFor="countryCode" className="label">Pays de résidence</label>
            <select id="countryCode" name="countryCode" className="input" required defaultValue="">
              <option value="" disabled>Choisissez votre pays</option>
              {countries.map((c) => (
                <option key={c.code} value={c.code}>{c.flag} {c.name} ({c.dialCode})</option>
              ))}
            </select>
          </div>
          <Field label="Ville (facultatif)" name="city" autoComplete="address-level2" />
          <Field label="Mot de passe" name="password" type="password" autoComplete="new-password" required minLength={10} hint="10 caractères minimum, avec des lettres et des chiffres." />
          <Field label="Confirmer le mot de passe" name="passwordConfirm" type="password" autoComplete="new-password" required />
          <label className="flex items-start gap-3 text-sm">
            <input type="checkbox" name="terms" required className="mt-1 h-4 w-4" />
            <span>J&apos;accepte les conditions générales et j&apos;ai pris connaissance de la <Link href="/risques" className="font-semibold text-accent underline">politique de risques</Link>.</span>
          </label>
        </ActionForm>
      </div>
    </div>
  );
}
