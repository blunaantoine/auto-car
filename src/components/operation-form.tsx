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
        {!op ? (
          <TextArea label="Liens des photos (facultatif, un par ligne)" name="photos"
            hint="Vous pourrez aussi envoyer des photos depuis votre ordinateur ou votre téléphone sur la page de l'opération, une fois le brouillon créé." />
        ) : (
          <p className="text-sm text-muted">Les photos (liens ou fichiers) se gèrent dans la section « Photos du véhicule » de la page.</p>
        )}
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

type Op = Operation & { vehicle: Vehicle; budgetLines: BudgetLine[] };
type Act = (s: ActionState, fd: FormData) => Promise<ActionState>;

/** Correction des informations descriptives d'une opération publiée. */
export function OperationDetailsForm({ action, op }: { action: Act; op: Op }) {
  const v = op.vehicle;
  return (
    <ActionForm action={action} submitLabel="Enregistrer la correction" className="space-y-4">
      <input type="hidden" name="operationId" value={op.id} />
      <Field label="Titre" name="title" defaultValue={op.title} required />
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Marque" name="make" defaultValue={v.make} required />
        <Field label="Modèle" name="model" defaultValue={v.model} required />
        <Field label="Année" name="year" inputMode="numeric" defaultValue={v.year ?? ""} />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="État" name="condition" defaultValue={v.condition} required />
        <Field label="Localisation" name="location" defaultValue={v.location} required />
        <Field label="Durée estimée (jours)" name="estimatedDurationDays" inputMode="numeric" defaultValue={op.estimatedDurationDays ?? ""} />
      </div>
      <TextArea label="Description des dommages" name="damageDescription" defaultValue={v.damageDescription} required />
      <TextArea label="Description" name="description" defaultValue={op.description} required />
      <TextArea label="Risques" name="risks" defaultValue={op.risks} required />
      <TextArea label="Motif de la correction (visible par les investisseurs)" name="reason" rows={2} required />
    </ActionForm>
  );
}

/** Correction des montants — super administrateur uniquement. */
export function FinancialsCorrectionForm({ action, op }: { action: Act; op: Op }) {
  const s = (x: bigint | null | undefined) => (x === null || x === undefined ? "" : x.toString());
  return (
    <ActionForm action={action} submitLabel="Corriger les montants" submitClass="btn-danger" className="space-y-4"
      confirm="Corriger les conditions financières d'une opération publiée ? La correction est journalisée et les investisseurs sont prévenus.">
      <input type="hidden" name="operationId" value={op.id} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Contribution de l'entreprise (E)" name="companyContribution" inputMode="numeric" defaultValue={s(op.companyContribution)} required />
        <Field label="Montant recherché auprès des particuliers" name="investorTarget" inputMode="numeric" defaultValue={s(op.investorTarget)} required
          hint={`Déjà investi : ${s(op.investorFunded)} FCFA — impossible de descendre en dessous.`} />
        <Field label="Minimum par investissement" name="minInvestment" inputMode="numeric" defaultValue={s(op.minInvestment)} required />
        <Field label="Plafond par investisseur (facultatif)" name="maxPerInvestor" inputMode="numeric" defaultValue={s(op.maxPerInvestor)} />
      </div>
      <p className="text-xs text-muted">Détail du budget (facultatif ; si renseigné, le total doit égaler E + montant recherché)</p>
      <div className="grid gap-4 sm:grid-cols-3">
        {BUDGET.map((c) => (
          <Field key={c} label={EXPENSE_CATEGORY_LABELS[c]} name={`budget_${c}`} inputMode="numeric" defaultValue={s(op.budgetLines.find((l) => l.category === c)?.amount)} />
        ))}
      </div>
      <TextArea label="Motif de la correction (visible par les investisseurs)" name="reason" rows={2} required />
    </ActionForm>
  );
}
