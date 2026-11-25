import Link from "next/link";
import { prisma } from "@/lib/db";
import { OperationCard } from "@/components/operation-card";
import { Empty } from "@/components/ui";

export const dynamic = "force-dynamic";

const STEPS = [
  ["Sélection", "L'entreprise identifie un véhicule accidenté ou à remettre en état et établit un budget prévisionnel détaillé."],
  ["Financement", "L'opération est publiée. Vous investissez depuis votre portefeuille, à partir de 2 500 FCFA. L'entreprise apporte le reste."],
  ["Travaux et vente", "Achat, réparation, mise en vente : chaque dépense est justifiée et chaque étape publiée dans votre espace."],
  ["Clôture et gains", "Après la vente, le résultat net est calculé et validé. Vous réclamez votre capital et votre part du bénéfice."],
];

const HIGHLIGHTS: [string, string][] = [
  ["À partir de 2 500 FCFA", "Investissez par petites sommes, sans frais sur votre portefeuille."],
  ["Suivi transparent", "Budget, dépenses justifiées, mises à jour : tout est publié."],
  ["Comptabilité vérifiable", "Chaque mouvement passe par un grand livre immuable."],
];

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-emerald-300" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m5 12.5 4.2 4.2L19 7" />
    </svg>
  );
}

export default async function Home() {
  const featured = await prisma.operation.findMany({
    where: { status: { in: ["FUNDING_OPEN", "FUNDED", "REPAIR", "ON_SALE"] } },
    include: { vehicle: true },
    orderBy: [{ status: "asc" }, { publishedAt: "desc" }],
    take: 3,
  });
  return (
    <>
      <section className="relative overflow-hidden bg-linear-to-br from-ink-deep via-ink to-ink-soft text-white">
        <div aria-hidden className="pointer-events-none absolute -top-24 right-[-10%] h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute bottom-[-35%] left-[-8%] h-80 w-80 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-14 sm:py-20 lg:grid-cols-[1.2fr_1fr] lg:items-center">
          <div className="animate-fade-up">
            <p className="mb-4 inline-block rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-medium tracking-wide ring-1 ring-inset ring-white/15">
              Investissement participatif automobile
            </p>
            <h1 className="text-3xl font-extrabold leading-[1.15] tracking-tight sm:text-5xl">
              Financez la remise en état de véhicules.{" "}
              <span className="bg-linear-to-r from-teal-300 to-emerald-300 bg-clip-text text-transparent">Partagez le résultat de leur revente.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-white/80">
              Chaque véhicule est une opération distincte, avec son budget, son suivi et son résultat propre. Vous voyez où va
              votre argent, du rachat à la revente.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/vehicules" className="btn bg-white text-ink shadow-lg hover:bg-white/90">Voir les opérations</Link>
              <Link href="/comment-ca-marche" className="btn border border-white/30 text-white hover:bg-white/10">Comprendre le modèle</Link>
            </div>
            <ul className="mt-8 grid gap-3 text-sm sm:grid-cols-3">
              {HIGHLIGHTS.map(([t, d]) => (
                <li key={t} className="rounded-xl bg-white/5 p-3.5 ring-1 ring-inset ring-white/10">
                  <div className="flex items-center gap-2 font-semibold text-white">
                    <CheckIcon />
                    {t}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-white/70">{d}</p>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-white/10 p-6 ring-1 ring-white/15 backdrop-blur-sm">
            <div className="text-sm font-semibold text-white/70">Exemple pédagogique</div>
            <dl className="mt-4 space-y-2 text-sm">
              {[
                ["Apport de l'entreprise", "1 000 000 FCFA"],
                ["Apports des particuliers", "500 000 FCFA"],
                ["Bénéfice net constaté", "600 000 FCFA"],
                ["Part théorique de l'entreprise", "400 000 FCFA"],
                ["Part conservée (50 %)", "200 000 FCFA"],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-white/10 pb-2">
                  <dt className="text-white/70">{k}</dt>
                  <dd className="font-semibold tabular-nums">{v}</dd>
                </div>
              ))}
              <div className="flex justify-between gap-3 pt-1 text-base">
                <dt className="font-semibold">Partagés entre particuliers</dt>
                <dd className="font-bold tabular-nums text-emerald-300">400 000 FCFA</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-white/60">Illustration uniquement : ni rendement garanti, ni promesse de gain.</p>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-14">
        <h2 className="text-2xl font-bold text-ink">Comment ça fonctionne</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map(([title, text], i) => (
            <li key={title} className="card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-linear-to-br from-accent to-teal-600 text-sm font-bold text-white shadow-sm">{i + 1}</div>
              <h3 className="mt-3 font-semibold text-ink">{title}</h3>
              <p className="mt-1 text-sm text-muted">{text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-14">
        <div className="mb-6 flex items-end justify-between gap-4">
          <h2 className="text-2xl font-bold text-ink">Opérations en vedette</h2>
          <Link href="/vehicules" className="text-sm font-semibold text-accent hover:underline">Tout le catalogue →</Link>
        </div>
        {featured.length ? (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {featured.map((op) => <OperationCard key={op.id} op={op} />)}
          </div>
        ) : (
          <Empty>Aucune opération ouverte pour le moment.</Empty>
        )}
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-4">
        <div className="relative overflow-hidden rounded-2xl bg-linear-to-r from-ink to-ink-soft px-6 py-8 text-white shadow-lift sm:px-10">
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-accent/40 blur-2xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">Prêt à participer à la prochaine opération ?</h2>
              <p className="mt-1 text-sm text-white/75">Créez votre compte, alimentez votre portefeuille chez un agent local et investissez dès 2 500 FCFA.</p>
            </div>
            <Link href="/inscription" className="btn shrink-0 bg-white text-ink shadow-md hover:bg-white/90">Créer mon compte</Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16">
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <strong>Avertissement sur les risques.</strong> Une opération peut subir un retard, un surcoût de réparation, une
          baisse du prix de revente ou l&apos;absence d&apos;acheteur. Vous pouvez perdre tout ou partie du capital investi.
          N&apos;investissez que des sommes dont vous n&apos;avez pas besoin à court terme. <Link href="/risques" className="font-semibold underline">En savoir plus</Link>
        </div>
      </section>
    </>
  );
}
