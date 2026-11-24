import type { BudgetLine, Operation, Vehicle } from "@prisma/client";
import type { ActionState } from "@/lib/actions";
import { EXPENSE_CATEGORY_LABELS } from "@/lib/labels";
import { ActionForm, Field, TextArea } from "./action-form";

const BUDGET = ["ACQUISITION", "TRANSPORT", "PARTS", "LABOR", "ADMIN_FEES", "OTHER"] as const;

export function OperationForm({
  action,
  op,
  submitLabel,
}: {
  action: (s: ActionState, fd: FormData) => Promise<ActionState>;
  op?: Operation & { vehicle: Vehicle; budgetLines: BudgetLine[] };
  submitLabel: string;
}) {
  const v = op?.vehicle;
  const s = (x: bigint | null | undefined) => (x === null || x === undefined ? "" : x.toString());
  return (
    <ActionForm action={action} submitLabel={submitLabel} className="space-y-6">
      {op && <input type="hidden" name="operationId" value={op.id} />}
      <fieldset className="card space-y-4">
        <legend className="px-1 text-lg font-semibold text-ink">Véhicule</legend>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Marque" name="make" defaultValue={v?.make} required />
          <Field label="Modèle" name="model" defaultValue={v?.model} required />
          <Field label="Année (si connue)" name="year" inputMode="numeric" defaultValue={v?.year ?? ""} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="État" name="condition" defaultValue={v?.condition} placeholder="Accidenté, roulant…" required />
          <Field label="Localisation" name="location" defaultValue={v?.location} required />
        </div>
        <TextArea label="Description des dommages" name="damageDescription" defaultValue={v?.damageDescription} required />
        <TextArea label="Photos (une URL par ligne)" name="photos" defaultValue={v?.photos.join("\n")} hint="Photos récentes du véhicule. Le stockage privé des fichiers arrive avec la gestion documentaire." />
      </fieldset>

      <fieldset className="card space-y-4">
        <legend className="px-1 text-lg font-semibold text-ink">Fiche d&apos;opération</legend>
        <Field label="Titre" name="title" defaultValue={op?.title} required />
        <TextArea label="Description" name="description" defaultValue={op?.description} required />
        <TextArea label="Risques spécifiques" name="risks" defaultValue={op?.risks} required hint="Affichés avant chaque investissement." />
        <Field label="Durée estimée (jours, indicative)" name="estimatedDurationDays" inputMode="numeric" defaultValue={op?.estimatedDurationDays ?? ""} />
      </fieldset>

      <fieldset className="card space-y-4">
        <legend className="px-1 text-lg font-semibold text-ink">Financement (FCFA)</legend>
        <p className="text-sm text-muted">Budget prévisionnel total = contribution de l&apos;entreprise + montant recherché auprès des particuliers.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contribution de l'entreprise (E)" name="companyContribution" inputMode="numeric" defaultValue={s(op?.companyContribution)} required />
          <Field label="Montant recherché auprès des particuliers" name="investorTarget" inputMode="numeric" defaultValue={s(op?.investorTarget)} required />
          <Field label="Minimum par investissement" name="minInvestment" inputMode="numeric" defaultValue={s(op?.minInvestment) || "2500"} required />
          <Field label="Plafond par investisseur (facultatif)" name="maxPerInvestor" inputMode="numeric" defaultValue={s(op?.maxPerInvestor)} />
        </div>
        <h3 className="pt-2 text-sm font-semibold text-ink">Détail du budget prévisionnel (facultatif — si renseigné, le total doit égaler le budget)</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          {BUDGET.map((c) => (
            <Field key={c} label={EXPENSE_CATEGORY_LABELS[c]} name={`budget_${c}`} inputMode="numeric" defaultValue={s(op?.budgetLines.find((l) => l.category === c)?.amount)} />
          ))}
        </div>
      </fieldset>
    </ActionForm>
  );
}
