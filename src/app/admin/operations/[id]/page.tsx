import Link from "next/link";
import { notFound } from "next/navigation";
import type { ExpenseCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { requireActor } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { allowedManualTransitions, STATUS_LABELS } from "@/lib/domain/operation-status";
import { LOSS_RULE_LABELS, type LossRule } from "@/lib/domain/profit-sharing";
import { DomainError } from "@/lib/errors";
import { EXPENSE_CATEGORY_LABELS, EXPENSE_STATUS_LABELS, formatDate, formatDateTime, SETTLEMENT_STATUS_LABELS } from "@/lib/labels";
import { formatMoney, formatSigned } from "@/lib/money";
import { previewClosure } from "@/lib/services/closure";
import {
  acquisitionAction,
  addExpenseAction,
  discardClosureAction,
  prepareClosureAction,
  publishUpdateAction,
  reviewExpenseAction,
  saleAction,
  transitionAction,
  updateOperationAction,
  validateClosureAction,
} from "@/app/actions/admin";
import { ActionForm, Field, TextArea } from "@/components/action-form";
import { OperationForm } from "@/components/operation-form";
import { Badge, KeyValue, Notice, PageHeader, Progress, Section, StatusBadge } from "@/components/ui";

export const dynamic = "force-dynamic";

const today = () => new Date().toISOString().slice(0, 10);

export default async function AdminOperation({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const actor = await requireActor("backoffice.access");
  const op = await prisma.operation.findUnique({
    where: { id },
    include: {
      vehicle: true,
      budgetLines: true,
      expenses: { orderBy: { createdAt: "desc" } },
      updates: { orderBy: { createdAt: "desc" } },
      investments: { include: { user: true }, orderBy: { createdAt: "asc" } },
      closure: { include: { settlements: { include: { user: true } } } },
      statusHistory: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!op) notFound();

  const manage = can(actor.role, "operations.manage");
  const transitions = allowedManualTransitions(op.status).filter((s) => s !== "SOLD");
  const editable = manage && (op.status === "DRAFT" || op.status === "IN_REVIEW");
  const locked = ["CLOSED", "ARCHIVED", "CANCELLED", "CLOSING_PENDING"].includes(op.status);

  const people = await prisma.user.findMany({
    where: { id: { in: [...new Set([...op.expenses.flatMap((e) => [e.createdById, e.reviewedById]), op.closure?.preparedById, op.closure?.validatedById].filter(Boolean) as string[])] } },
    select: { id: true, firstName: true, lastName: true },
  });
  const who = (uid?: string | null) => {
    const p = people.find((x) => x.id === uid);
    return p ? `${p.firstName} ${p.lastName}` : "—";
  };

  // Budget prévisionnel vs réalisé (dépenses approuvées)
  const categories = [...new Set([...op.budgetLines.map((l) => l.category), ...op.expenses.map((e) => e.category)])] as ExpenseCategory[];
  const approvedTotal = op.expenses.filter((e) => e.status === "APPROVED").reduce((a, e) => a + e.amount, 0n);

  let preview: Awaited<ReturnType<typeof previewClosure>> | null = null;
  let previewError: string | null = null;
  if ((op.status === "SOLD" || op.status === "CLOSING_PENDING") && op.closure?.status !== "VALIDATED") {
    try {
      preview = await previewClosure(op.id);
    } catch (e) {
      if (e instanceof DomainError) previewError = e.message;
      else throw e;
    }
  }

  return (
    <>
      <PageHeader
        title={op.title}
        subtitle={<span className="flex flex-wrap items-center gap-2"><StatusBadge status={op.status} /> <span>{op.vehicle.make} {op.vehicle.model} · {op.vehicle.location}</span></span>}
        actions={<Link href={`/vehicules/${op.slug}`} className="btn-ghost">Fiche publique</Link>}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Section title="Financement">
            <div className="mb-4"><Progress value={op.investorFunded} max={op.investorTarget} /></div>
            <KeyValue items={[
              ["Budget prévisionnel", formatMoney(op.acquisitionBudget)],
              ["Contribution de l'entreprise (E)", formatMoney(op.companyContribution)],
              ["Recherché auprès des particuliers", formatMoney(op.investorTarget)],
              ["Financé par les particuliers (P)", formatMoney(op.investorFunded)],
              ["Prix d'achat réel", op.acquisitionPrice ? `${formatMoney(op.acquisitionPrice)} (${formatDate(op.acquiredAt)})` : "—"],
              ["Prix de vente", op.salePrice ? `${formatMoney(op.salePrice)} (${formatDate(op.soldAt)})` : "—"],
            ]} />
            {op.investments.length > 0 && (
              <details className="mt-4">
                <summary className="cursor-pointer text-sm font-medium text-accent">Investisseurs participants ({op.investments.length})</summary>
                <div className="table-wrap mt-3">
                  <table className="table">
                    <thead><tr><th>Investisseur</th><th>Date</th><th>Statut</th><th className="text-right">Montant</th></tr></thead>
                    <tbody>
                      {op.investments.map((i) => (
                        <tr key={i.id}>
                          <td>{i.user.firstName} {i.user.lastName}</td>
                          <td className="text-muted">{formatDateTime(i.createdAt)}</td>
                          <td>{i.status}</td>
                          <td className="text-right tabular-nums">{formatMoney(i.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </Section>

          {editable && (
            <details className="card">
              <summary className="cursor-pointer text-lg font-semibold text-ink">Modifier la fiche</summary>
              <div className="mt-4"><OperationForm action={updateOperationAction} op={op} submitLabel="Enregistrer les modifications" /></div>
            </details>
          )}

          <Section title="Dépenses et justificatifs">
            <div id="depenses" className="table-wrap">
              <table className="table">
                <thead><tr><th>Catégorie</th><th>Prévu</th><th>Approuvé</th></tr></thead>
                <tbody>
                  {categories.map((c) => {
                    const planned = op.budgetLines.filter((l) => l.category === c).reduce((a, l) => a + l.amount, 0n);
                    const actual = op.expenses.filter((e) => e.category === c && e.status === "APPROVED").reduce((a, e) => a + e.amount, 0n);
                    return (
                      <tr key={c}>
                        <td>{EXPENSE_CATEGORY_LABELS[c]}</td>
                        <td className="tabular-nums">{planned ? formatMoney(planned) : "—"}</td>
                        <td className={`tabular-nums ${planned && actual > planned ? "font-semibold text-red-700" : ""}`}>{formatMoney(actual)}</td>
                      </tr>
                    );
                  })}
                  <tr><td className="font-semibold">Total</td><td className="tabular-nums font-semibold">{formatMoney(op.acquisitionBudget)}</td><td className={`tabular-nums font-semibold ${approvedTotal > op.acquisitionBudget ? "text-red-700" : ""}`}>{formatMoney(approvedTotal)}</td></tr>
                </tbody>
              </table>
            </div>

            <ul className="mt-5 divide-y divide-line">
              {op.expenses.map((e) => (
                <li key={e.id} className="py-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-medium">{e.label} <span className="text-muted">· {EXPENSE_CATEGORY_LABELS[e.category]}</span></div>
                      <div className="text-xs text-muted">
                        {formatDate(e.incurredAt)} · {e.supplier ?? "Fournisseur non précisé"} · saisie par {who(e.createdById)}
                        {e.documentRef && <> · pièce : <span className="font-mono">{e.documentRef}</span></>}
                        {e.reviewedById && <> · {EXPENSE_STATUS_LABELS[e.status].toLowerCase()} par {who(e.reviewedById)}{e.reviewNote ? ` (« ${e.reviewNote} »)` : ""}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatMoney(e.amount)}</span>
                      <Badge tone={e.status === "APPROVED" ? "success" : e.status === "REJECTED" ? "danger" : "warning"}>{EXPENSE_STATUS_LABELS[e.status]}</Badge>
                    </div>
                  </div>
                  {e.status === "PENDING" && can(actor.role, "expenses.review") && e.createdById !== actor.id && !locked && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      <ActionForm action={reviewExpenseAction} className="flex gap-2" submitLabel="Approuver" submitClass="btn-accent px-3 py-1.5">
                        <input type="hidden" name="expenseId" value={e.id} /><input type="hidden" name="operationId" value={op.id} /><input type="hidden" name="decision" value="APPROVED" />
                      </ActionForm>
                      <ActionForm action={reviewExpenseAction} className="flex flex-wrap gap-2" submitLabel="Rejeter" submitClass="btn-danger px-3 py-1.5">
                        <input type="hidden" name="expenseId" value={e.id} /><input type="hidden" name="operationId" value={op.id} /><input type="hidden" name="decision" value="REJECTED" />
                        <input name="note" placeholder="Motif du rejet" className="input w-48 py-1.5" required />
                      </ActionForm>
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {can(actor.role, "expenses.record") && !locked && !["DRAFT", "IN_REVIEW"].includes(op.status) && (
              <details className="mt-4 rounded-lg bg-paper p-4">
                <summary className="cursor-pointer text-sm font-semibold text-ink">Ajouter une dépense</summary>
                <ActionForm action={addExpenseAction} submitLabel="Enregistrer la dépense" className="mt-4 space-y-3">
                  <input type="hidden" name="operationId" value={op.id} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="label" htmlFor="category">Catégorie</label>
                      <select id="category" name="category" className="input">{Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
                    </div>
                    <Field label="Montant (FCFA)" name="amount" inputMode="numeric" required />
                    <Field label="Libellé" name="label" required />
                    <Field label="Fournisseur" name="supplier" />
                    <Field label="Date" name="incurredAt" type="date" defaultValue={today()} required />
                    <Field label="Référence / lien de la pièce justificative" name="documentRef" />
                  </div>
                  <p className="text-xs text-muted">La dépense compte dans le résultat seulement après validation par une autre personne habilitée.</p>
                </ActionForm>
              </details>
            )}
          </Section>

          {(preview || previewError || op.closure) && (
            <Section title="Clôture financière">
              {previewError && <Notice tone="warning">{previewError}</Notice>}
              {op.closure ? (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone={op.closure.status === "VALIDATED" ? "success" : "warning"}>{op.closure.status === "VALIDATED" ? "Validée" : "Brouillon à valider"}</Badge>
                    <span className="text-muted">Préparée par {who(op.closure.preparedById)} le {formatDateTime(op.closure.preparedAt)}{op.closure.validatedById && <> · validée par {who(op.closure.validatedById)} le {formatDateTime(op.closure.validatedAt)}</>}</span>
                  </div>
                  <KeyValue items={[
                    ["Recettes (prix de vente)", formatMoney(op.closure.revenue)],
                    ["Coûts réels approuvés", formatMoney(op.closure.totalCosts)],
                    ["Résultat net (B)", formatSigned(op.closure.netResult)],
                    ["Part théorique de l'entreprise", formatMoney(op.closure.companyTheoreticalShare)],
                    ["Part conservée par l'entreprise", formatMoney(op.closure.companyFinalShare)],
                    ["Enveloppe des particuliers", formatSigned(op.closure.investorsEnvelope)],
                    ["Règle de perte appliquée", LOSS_RULE_LABELS[op.closure.lossRule as LossRule] ?? op.closure.lossRule],
                  ]} />
                  <div className="table-wrap">
                    <table className="table">
                      <thead><tr><th>Investisseur</th><th className="text-right">Capital</th><th className="text-right">Résultat</th><th className="text-right">Récupérable</th><th>Statut</th></tr></thead>
                      <tbody>
                        {op.closure.settlements.map((s) => (
                          <tr key={s.id}>
                            <td>{s.user.firstName} {s.user.lastName}</td>
                            <td className="text-right tabular-nums">{formatMoney(s.capital)}</td>
                            <td className="text-right tabular-nums">{formatSigned(s.result)}</td>
                            <td className="text-right font-semibold tabular-nums">{formatMoney(s.claimable)}</td>
                            <td>{SETTLEMENT_STATUS_LABELS[s.status]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {op.closure.status === "DRAFT" && (
                    <div className="flex flex-wrap items-start gap-3">
                      {can(actor.role, "closure.validate") && op.closure.preparedById !== actor.id ? (
                        <ActionForm action={validateClosureAction} submitLabel="Valider la clôture" submitClass="btn-accent" confirm="Valider définitivement cette clôture ? Les montants deviendront réclamables et l'opération sera figée.">
                          <input type="hidden" name="operationId" value={op.id} />
                        </ActionForm>
                      ) : (
                        <Notice>La validation doit être faite par un autre responsable financier que la personne qui a préparé la clôture.</Notice>
                      )}
                      {can(actor.role, "closure.prepare") && (
                        <>
                          <ActionForm action={prepareClosureAction} submitLabel="Recalculer" submitClass="btn-ghost"><input type="hidden" name="operationId" value={op.id} /></ActionForm>
                          <ActionForm action={discardClosureAction} className="flex flex-wrap gap-2" submitLabel="Annuler le brouillon" submitClass="btn-danger">
                            <input type="hidden" name="operationId" value={op.id} />
                            <input name="reason" className="input w-56" placeholder="Motif (ex. dépense oubliée)" required />
                          </ActionForm>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ) : preview ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted">Aperçu calculé à partir des dépenses approuvées. Rien n&apos;est enregistré tant que la clôture n&apos;est pas préparée.</p>
                  <KeyValue items={[
                    ["Recettes", formatMoney(preview.op.salePrice!)],
                    ["Coûts approuvés", formatMoney(preview.totalCosts)],
                    ["Résultat net (B)", formatSigned(preview.netResult)],
                    ["Part conservée par l'entreprise", formatMoney(preview.distribution.companyFinalShare)],
                    ["Enveloppe des particuliers", formatSigned(preview.distribution.investorsEnvelope)],
                  ]} />
                  {can(actor.role, "closure.prepare") && (
                    <ActionForm action={prepareClosureAction} submitLabel="Préparer la clôture"><input type="hidden" name="operationId" value={op.id} /></ActionForm>
                  )}
                </div>
              ) : null}
            </Section>
          )}

          <Section title="Mises à jour publiées">
            {manage && !["CLOSED", "ARCHIVED"].includes(op.status) && (
              <ActionForm action={publishUpdateAction} submitLabel="Publier aux investisseurs" className="mb-5 space-y-3">
                <input type="hidden" name="operationId" value={op.id} />
                <Field label="Titre" name="title" required />
                <TextArea label="Message" name="body" required />
              </ActionForm>
            )}
            <ol className="space-y-3">
              {op.updates.map((u) => (
                <li key={u.id} className="border-l-2 border-accent pl-3 text-sm">
                  <div className="text-xs text-muted">{formatDateTime(u.createdAt)}</div>
                  <div className="font-medium">{u.title}</div>
                  <p className="whitespace-pre-line text-gray-700">{u.body}</p>
                </li>
              ))}
              {!op.updates.length && <li className="text-sm text-muted">Aucune mise à jour.</li>}
            </ol>
          </Section>
        </div>

        <aside className="space-y-6">
          {manage && (transitions.length > 0 || op.status === "SUSPENDED") && (
            <Section title="Changer l'état">
              <ActionForm action={transitionAction} submitLabel="Appliquer">
                <input type="hidden" name="operationId" value={op.id} />
                <div>
                  <label htmlFor="to" className="label">Nouvel état</label>
                  <select id="to" name="to" className="input" required>
                    {op.status === "SUSPENDED" && op.statusBeforeSuspend && <option value="RESUME">Reprendre ({STATUS_LABELS[op.statusBeforeSuspend]})</option>}
                    {transitions.map((t) => <option key={t} value={t}>{STATUS_LABELS[t]}</option>)}
                  </select>
                </div>
                <TextArea label="Motif (obligatoire pour suspendre ou annuler)" name="reason" rows={2} />
                <p className="text-xs text-muted">Annuler rembourse automatiquement le capital de chaque investisseur. « Financement atteint » manuel : l&apos;entreprise complète le montant manquant.</p>
              </ActionForm>
            </Section>
          )}

          {manage && ["ACQUISITION", "REPAIR", "READY_FOR_SALE"].includes(op.status) && (
            <Section title="Acquisition">
              <ActionForm action={acquisitionAction} submitLabel="Enregistrer">
                <input type="hidden" name="operationId" value={op.id} />
                <Field label="Prix d'achat réel (FCFA)" name="price" inputMode="numeric" defaultValue={op.acquisitionPrice?.toString()} required />
                <Field label="Date d'acquisition" name="date" type="date" defaultValue={today()} required />
              </ActionForm>
            </Section>
          )}

          {manage && op.status === "ON_SALE" && (
            <Section title="Déclarer la vente">
              <ActionForm action={saleAction} submitLabel="Déclarer la vente" confirm="Confirmer la vente ? Les frais de vente doivent être saisis comme dépenses avant la clôture.">
                <input type="hidden" name="operationId" value={op.id} />
                <Field label="Prix de vente (FCFA)" name="price" inputMode="numeric" required />
                <Field label="Date de vente" name="date" type="date" defaultValue={today()} required />
                <p className="text-xs text-muted">La vente ne crédite pas les investisseurs : elle ouvre la clôture financière.</p>
              </ActionForm>
            </Section>
          )}

          <Section title="Historique des états">
            <ol className="space-y-2 text-sm">
              {op.statusHistory.map((h) => (
                <li key={h.id}>
                  <div>{STATUS_LABELS[h.from]} → <strong>{STATUS_LABELS[h.to]}</strong></div>
                  <div className="text-xs text-muted">{formatDateTime(h.createdAt)}{h.reason ? ` · ${h.reason}` : ""}</div>
                </li>
              ))}
              {!op.statusHistory.length && <li className="text-muted">Créée le {formatDateTime(op.createdAt)}</li>}
            </ol>
          </Section>
        </aside>
      </div>
    </>
  );
}
