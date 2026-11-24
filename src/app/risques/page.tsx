import { LOSS_RULE_LABELS } from "@/lib/domain/profit-sharing";
import { getLossRule, getSetting } from "@/lib/services/settings";
import { Notice, PageHeader } from "@/components/ui";

export const dynamic = "force-dynamic";
export const metadata = { title: "Risques et conditions" };

export default async function Risks() {
  const [lossRule, terms] = await Promise.all([getLossRule(), getSetting("TERMS_VERSION")]);
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <PageHeader title="Risques et conditions" subtitle={`Version des conditions en vigueur : ${terms}`} />
      <div className="space-y-6 text-sm leading-relaxed text-gray-700">
        <Notice tone="warning">
          Investir dans une opération automobile comporte un risque de perte partielle ou totale du capital. Le capital
          n&apos;est pas garanti. Aucun rendement, aucun délai de revente et aucun remboursement ne sont promis.
        </Notice>
        <section className="card">
          <h2 className="mb-2 font-semibold text-ink">Principaux risques</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>Défaut ou dommage caché découvert après l&apos;achat.</li>
            <li>Retard dans l&apos;acquisition, les travaux ou la vente.</li>
            <li>Surcoût de pièces, de main-d&apos;œuvre ou de formalités.</li>
            <li>Impossibilité de réparer le véhicule.</li>
            <li>Baisse du prix de revente, ou absence d&apos;acheteur.</li>
            <li>Perte partielle ou totale du capital investi.</li>
          </ul>
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold text-ink">Traitement des pertes et dépassements</h2>
          <p>Règle actuellement en vigueur : <strong>{LOSS_RULE_LABELS[lossRule]}</strong>.</p>
          <p className="mt-2">
            Le montant réel de toute perte, son origine et ses justificatifs sont enregistrés. Les conséquences pour chaque
            investisseur sont calculées uniquement selon la règle contractuelle approuvée. Les chiffres contestés peuvent
            faire l&apos;objet d&apos;une revue.
          </p>
        </section>
        <section className="card">
          <h2 className="mb-2 font-semibold text-ink">Transparence</h2>
          <ul className="list-inside list-disc space-y-1">
            <li>Les résultats réels sont publiés et clairement distingués du prévisionnel.</li>
            <li>Votre acceptation des risques est enregistrée à chaque investissement, avec la version des conditions.</li>
            <li>Chaque mouvement de votre portefeuille correspond à une écriture comptable traçable et non modifiable.</li>
          </ul>
        </section>
        <p className="text-xs text-muted">
          Ce document est une base produit. Le modèle doit être validé par des professionnels compétents (réglementation des
          investissements participatifs, collecte de fonds, protection des consommateurs, LCB-FT, fiscalité, données
          personnelles) avant toute collecte de fonds.
        </p>
      </div>
    </div>
  );
}
