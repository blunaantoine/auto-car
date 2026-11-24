import Link from "next/link";
import { PageHeader } from "@/components/ui";

export const metadata = { title: "Comment ça marche" };

export default function HowItWorks() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title="Comment ça marche" subtitle="Le cycle complet d'une opération, du rachat du véhicule à la réclamation de vos gains." />
      <div className="space-y-6">
        {[
          ["1. Sélection et budget", "L'entreprise identifie un véhicule accidenté ou à remettre en état. Elle évalue son prix d'acquisition et établit un budget prévisionnel : achat, transport, pièces, main-d'œuvre, formalités, frais divers et marge de sécurité."],
          ["2. Publication et financement", "La fiche de l'opération est publiée avec les informations disponibles, les risques, le montant recherché auprès des particuliers et la contribution de l'entreprise. Vous investissez depuis le solde disponible de votre portefeuille, à partir de 2 500 FCFA. L'entreprise peut compléter le financement."],
          ["3. Achat et travaux", "Une fois le financement réuni et validé, l'entreprise achète le véhicule et réalise les travaux. Chaque dépense est enregistrée avec son justificatif et validée par une seconde personne. Les étapes sont publiées dans votre espace."],
          ["4. Vente et clôture financière", "Le véhicule est mis en vente. La vente seule ne crédite personne : elle ouvre la clôture financière. Les recettes et toutes les dépenses réelles sont vérifiées, le résultat net est calculé puis validé par un second responsable."],
          ["5. Réclamation et réinvestissement", "Dans « Mes gains », vous voyez votre capital, votre part du résultat et le détail du calcul. Un clic sur « Réclamer mon capital et mes gains » crédite votre portefeuille. Vous pouvez ensuite réinvestir."],
        ].map(([t, d]) => (
          <section key={t} className="card">
            <h2 className="font-semibold text-ink">{t}</h2>
            <p className="mt-2 text-sm leading-relaxed text-gray-700">{d}</p>
          </section>
        ))}

        <section className="card">
          <h2 className="font-semibold text-ink">La règle de partage du bénéfice</h2>
          <p className="mt-2 text-sm leading-relaxed text-gray-700">
            Le bénéfice net distribuable (B) est calculé après déduction de tous les coûts réels de l&apos;opération. La part
            théorique de l&apos;entreprise est proportionnelle à son apport (E) dans le financement total (E + P).
            L&apos;entreprise renonce à 50 % de cette part théorique, au profit des particuliers. Les particuliers se
            partagent tout le reste au prorata de leurs apports.
          </p>
          <div className="table-wrap mt-4">
            <table className="table">
              <thead><tr><th>Calcul</th><th>Formule</th><th>Exemple</th></tr></thead>
              <tbody>
                <tr><td>Part théorique de l&apos;entreprise</td><td>B × E / (E + P)</td><td>600 000 × 1 M / 1,5 M = 400 000</td></tr>
                <tr><td>Part finale de l&apos;entreprise</td><td>Part théorique × 50 %</td><td>200 000</td></tr>
                <tr><td>Enveloppe des particuliers</td><td>B − part finale</td><td>400 000</td></tr>
                <tr><td>Gain d&apos;un investisseur</td><td>Enveloppe × I / P</td><td>100 000 investis → 80 000</td></tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-muted">Montants arrondis à l&apos;unité ; l&apos;arrondi profite aux particuliers et la somme des gains individuels est toujours égale à l&apos;enveloppe.</p>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href="/vehicules" className="btn-primary">Voir les opérations</Link>
          <Link href="/risques" className="btn-ghost">Lire les risques</Link>
        </div>
      </div>
    </div>
  );
}
