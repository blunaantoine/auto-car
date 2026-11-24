// Gestion des véhicules et des opérations — CDC §7.3 et §12.
import type { ExpenseCategory, OperationStatus } from "@prisma/client";
import { inTransaction, prisma } from "../db";
import { canTransition, isFinanciallyLocked, STATUS_LABELS } from "../domain/operation-status";
import { DomainError } from "../errors";
import { getOperationPool, getUserWallet, postTransaction } from "../ledger/ledger";
import { formatMoney } from "../money";
import { audit, notify } from "./audit";
import { getSetting } from "./settings";
import { requirePermission, type Actor } from "./types";

export interface OperationInput {
  title: string;
  description: string;
  risks: string;
  make: string;
  model: string;
  year: number | null;
  condition: string;
  damageDescription: string;
  location: string;
  photos: string[];
  acquisitionBudget: bigint;
  companyContribution: bigint;
  investorTarget: bigint;
  minInvestment: bigint;
  maxPerInvestor: bigint | null;
  estimatedDurationDays: number | null;
  budgetLines: { category: ExpenseCategory; label: string; amount: bigint }[];
}

export function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

async function validateFinancials(input: OperationInput) {
  const globalMin = BigInt(await getSetting("MIN_INVESTMENT"));
  if (input.investorTarget <= 0n) throw new DomainError("INVALID", "Le montant recherché auprès des particuliers doit être positif.");
  if (input.minInvestment < globalMin)
    throw new DomainError("INVALID", `Le minimum d'investissement ne peut pas être inférieur à ${formatMoney(globalMin)}.`);
  if (input.minInvestment > input.investorTarget) throw new DomainError("INVALID", "Le minimum dépasse le montant recherché.");
  if (input.maxPerInvestor !== null && input.maxPerInvestor < input.minInvestment)
    throw new DomainError("INVALID", "Le plafond par investisseur est inférieur au minimum.");
  if (input.companyContribution + input.investorTarget !== input.acquisitionBudget)
    throw new DomainError(
      "INVALID",
      "Le budget prévisionnel doit être égal à la contribution de l'entreprise plus le montant recherché auprès des particuliers.",
    );
  const linesTotal = input.budgetLines.reduce((a, l) => a + l.amount, 0n);
  if (input.budgetLines.length > 0 && linesTotal !== input.acquisitionBudget)
    throw new DomainError("INVALID", `La somme des lignes de budget (${formatMoney(linesTotal)}) doit égaler le budget prévisionnel.`);
}

export async function createOperation(actor: Actor, input: OperationInput) {
  requirePermission(actor, "operations.manage");
  await validateFinancials(input);
  return inTransaction(async (tx) => {
    const base = slugify(`${input.make} ${input.model} ${input.year ?? ""} ${input.location}`) || "operation";
    let slug = base;
    for (let i = 2; await tx.operation.findUnique({ where: { slug } }); i++) slug = `${base}-${i}`;
    const vehicle = await tx.vehicle.create({
      data: {
        make: input.make,
        model: input.model,
        year: input.year,
        condition: input.condition,
        damageDescription: input.damageDescription,
        location: input.location,
        photos: input.photos,
      },
    });
    const op = await tx.operation.create({
      data: {
        slug,
        title: input.title,
        description: input.description,
        risks: input.risks,
        vehicleId: vehicle.id,
        acquisitionBudget: input.acquisitionBudget,
        companyContribution: input.companyContribution,
        investorTarget: input.investorTarget,
        minInvestment: input.minInvestment,
        maxPerInvestor: input.maxPerInvestor,
        estimatedDurationDays: input.estimatedDurationDays,
        budgetLines: { create: input.budgetLines },
      },
    });
    await getOperationPool(tx, op.id);
    await audit(tx, actor, { action: "operation.create", entityType: "Operation", entityId: op.id, after: input });
    return op;
  });
}

/** Les champs financiers ne sont modifiables qu'avant l'ouverture du financement. */
export async function updateOperation(actor: Actor, operationId: string, input: OperationInput) {
  requirePermission(actor, "operations.manage");
  const op = await prisma.operation.findUnique({ where: { id: operationId }, include: { vehicle: true, budgetLines: true } });
  if (!op) throw new DomainError("NOT_FOUND", "Opération introuvable.");
  if (op.status !== "DRAFT" && op.status !== "IN_REVIEW")
    throw new DomainError("LOCKED", "Seule une opération en brouillon ou en vérification peut être modifiée.");
  await validateFinancials(input);
  return inTransaction(async (tx) => {
    await tx.vehicle.update({
      where: { id: op.vehicleId },
      data: {
        make: input.make,
        model: input.model,
        year: input.year,
        condition: input.condition,
        damageDescription: input.damageDescription,
        location: input.location,
        photos: input.photos,
      },
    });
    await tx.budgetLine.deleteMany({ where: { operationId } });
    const updated = await tx.operation.update({
      where: { id: operationId },
      data: {
        title: input.title,
        description: input.description,
        risks: input.risks,
        acquisitionBudget: input.acquisitionBudget,
        companyContribution: input.companyContribution,
        investorTarget: input.investorTarget,
        minInvestment: input.minInvestment,
        maxPerInvestor: input.maxPerInvestor,
        estimatedDurationDays: input.estimatedDurationDays,
        budgetLines: { create: input.budgetLines },
      },
    });
    await audit(tx, actor, { action: "operation.update", entityType: "Operation", entityId: op.id, before: op, after: input });
    return updated;
  });
}

async function investorIds(operationId: string): Promise<string[]> {
  const rows = await prisma.investment.findMany({ where: { operationId }, select: { userId: true }, distinct: ["userId"] });
  return rows.map((r) => r.userId);
}

export async function transitionOperation(actor: Actor, operationId: string, to: OperationStatus, reason?: string) {
  requirePermission(actor, "operations.manage");
  if (to === "CANCELLED") return cancelOperation(actor, operationId, reason ?? "");
  return inTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Operation" WHERE id = ${operationId} FOR UPDATE`;
    const op = await tx.operation.findUnique({ where: { id: operationId } });
    if (!op) throw new DomainError("NOT_FOUND", "Opération introuvable.");
    if (!canTransition(op.status, to))
      throw new DomainError("INVALID_TRANSITION", `Passage de « ${STATUS_LABELS[op.status]} » à « ${STATUS_LABELS[to]} » non autorisé.`);
    if (to === "SUSPENDED" && !reason?.trim()) throw new DomainError("REASON_REQUIRED", "Un motif de suspension est obligatoire.");
    if (to === "SOLD") throw new DomainError("USE_SALE", "Déclarez la vente avec son prix pour passer à l'état « Vendu ».");
    if (to === "FUNDED" && op.investorFunded === 0n)
      throw new DomainError("NO_FUNDING", "Aucune contribution de particulier : annulez ou attendez des investissements.");

    const data: Record<string, unknown> = { status: to };
    if (to === "PUBLISHED") data.publishedAt = new Date();
    if (to === "SUSPENDED") data.statusBeforeSuspend = op.status;
    if (to === "FUNDED" && op.investorFunded < op.investorTarget) {
      // L'entreprise complète le financement : sa contribution augmente d'autant (§2.1).
      const gap = op.investorTarget - op.investorFunded;
      data.companyContribution = op.companyContribution + gap;
      data.investorTarget = op.investorFunded;
    }
    if (to === "ACQUISITION" || to === "READY_FOR_SALE") {
      // rien de plus : prix d'achat saisi via recordAcquisition
    }
    await tx.operation.update({ where: { id: op.id }, data });
    await tx.operationStatusChange.create({ data: { operationId: op.id, from: op.status, to, reason, actorId: actor.id } });
    await audit(tx, actor, {
      action: "operation.transition",
      entityType: "Operation",
      entityId: op.id,
      before: { status: op.status, companyContribution: op.companyContribution, investorTarget: op.investorTarget },
      after: data,
      reason,
    });
    return op;
  }).then(async (op) => {
    if (["FUNDED", "ACQUISITION", "REPAIR", "ON_SALE", "SUSPENDED"].includes(to)) {
      const ids = await investorIds(op.id);
      await prisma.notification.createMany({
        data: ids.map((userId) => ({
          userId,
          title: `Mise à jour : ${op.title}`,
          body: `L'opération est passée à l'état « ${STATUS_LABELS[to]} ».`,
          link: `/vehicules/${op.slug}`,
        })),
      });
    }
  });
}

export async function resumeOperation(actor: Actor, operationId: string, reason: string) {
  requirePermission(actor, "operations.manage");
  return inTransaction(async (tx) => {
    const op = await tx.operation.findUnique({ where: { id: operationId } });
    if (!op || op.status !== "SUSPENDED" || !op.statusBeforeSuspend)
      throw new DomainError("INVALID_TRANSITION", "Cette opération n'est pas suspendue.");
    await tx.operation.update({ where: { id: op.id }, data: { status: op.statusBeforeSuspend, statusBeforeSuspend: null } });
    await tx.operationStatusChange.create({
      data: { operationId: op.id, from: "SUSPENDED", to: op.statusBeforeSuspend, reason, actorId: actor.id },
    });
    await audit(tx, actor, { action: "operation.resume", entityType: "Operation", entityId: op.id, after: { status: op.statusBeforeSuspend }, reason });
  });
}

/** Annulation avant acquisition : chaque investisseur est remboursé de son capital. */
export async function cancelOperation(actor: Actor, operationId: string, reason: string) {
  requirePermission(actor, "operations.manage");
  if (!reason.trim()) throw new DomainError("REASON_REQUIRED", "Un motif d'annulation est obligatoire.");
  return inTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Operation" WHERE id = ${operationId} FOR UPDATE`;
    const op = await tx.operation.findUnique({ where: { id: operationId }, include: { investments: { where: { status: "ACTIVE" } } } });
    if (!op) throw new DomainError("NOT_FOUND", "Opération introuvable.");
    if (!canTransition(op.status, "CANCELLED"))
      throw new DomainError("INVALID_TRANSITION", "Annulation impossible après le début de l'acquisition : clôturez l'opération.");
    const pool = await getOperationPool(tx, op.id);
    for (const inv of op.investments) {
      const wallet = await getUserWallet(tx, inv.userId);
      await postTransaction(tx, {
        type: "REFUND",
        idempotencyKey: `refund:${inv.id}`,
        description: `Remboursement — annulation de « ${op.title} »`,
        createdById: actor.id,
        entries: [
          { accountId: pool.id, amount: -inv.amount, memo: "Remboursement du capital" },
          { accountId: wallet.id, amount: inv.amount, memo: "Remboursement du capital" },
        ],
      });
      await tx.investment.update({ where: { id: inv.id }, data: { status: "REFUNDED" } });
      await notify(tx, inv.userId, "Opération annulée", `« ${op.title} » est annulée. ${formatMoney(inv.amount)} ont été remboursés sur votre portefeuille.`, "/espace");
    }
    await tx.operation.update({ where: { id: op.id }, data: { status: "CANCELLED" } });
    await tx.operationStatusChange.create({ data: { operationId: op.id, from: op.status, to: "CANCELLED", reason, actorId: actor.id } });
    await audit(tx, actor, {
      action: "operation.cancel",
      entityType: "Operation",
      entityId: op.id,
      before: { status: op.status },
      after: { status: "CANCELLED", refunds: op.investments.length },
      reason,
    });
  });
}

export async function recordAcquisition(actor: Actor, operationId: string, price: bigint, date: Date) {
  requirePermission(actor, "operations.manage");
  return inTransaction(async (tx) => {
    const op = await tx.operation.findUnique({ where: { id: operationId } });
    if (!op) throw new DomainError("NOT_FOUND", "Opération introuvable.");
    if (!["ACQUISITION", "REPAIR", "READY_FOR_SALE"].includes(op.status))
      throw new DomainError("INVALID_STATE", "Le prix d'achat se saisit pendant l'acquisition ou les travaux.");
    if (price <= 0n) throw new DomainError("INVALID", "Prix d'achat invalide.");
    await tx.operation.update({ where: { id: op.id }, data: { acquisitionPrice: price, acquiredAt: date } });
    await audit(tx, actor, {
      action: "operation.acquisition",
      entityType: "Operation",
      entityId: op.id,
      before: { acquisitionPrice: op.acquisitionPrice, acquiredAt: op.acquiredAt },
      after: { acquisitionPrice: price, acquiredAt: date },
    });
  });
}

/** La vente ne crédite personne : elle ouvre seulement la clôture financière (§8.1). */
export async function declareSale(actor: Actor, operationId: string, price: bigint, date: Date) {
  requirePermission(actor, "operations.manage");
  return inTransaction(async (tx) => {
    const op = await tx.operation.findUnique({ where: { id: operationId } });
    if (!op) throw new DomainError("NOT_FOUND", "Opération introuvable.");
    if (op.status !== "ON_SALE") throw new DomainError("INVALID_STATE", "Le véhicule doit être « En vente ».");
    if (price <= 0n) throw new DomainError("INVALID", "Prix de vente invalide.");
    await tx.operation.update({ where: { id: op.id }, data: { salePrice: price, soldAt: date, status: "SOLD" } });
    await tx.operationStatusChange.create({ data: { operationId: op.id, from: op.status, to: "SOLD", actorId: actor.id } });
    await audit(tx, actor, { action: "operation.sale", entityType: "Operation", entityId: op.id, after: { salePrice: price, soldAt: date } });
    const invs = await tx.investment.findMany({ where: { operationId: op.id }, select: { userId: true }, distinct: ["userId"] });
    for (const { userId } of invs)
      await notify(tx, userId, `Véhicule vendu : ${op.title}`, "La clôture financière va être préparée. Vos gains seront réclamables après validation.", `/vehicules/${op.slug}`);
  });
}

export async function addExpense(
  actor: Actor,
  operationId: string,
  input: { category: ExpenseCategory; label: string; amount: bigint; supplier?: string; documentRef?: string; incurredAt: Date },
) {
  requirePermission(actor, "expenses.record");
  return inTransaction(async (tx) => {
    const op = await tx.operation.findUnique({ where: { id: operationId } });
    if (!op) throw new DomainError("NOT_FOUND", "Opération introuvable.");
    if (isFinanciallyLocked(op.status)) throw new DomainError("LOCKED", "Opération clôturée : aucune dépense ne peut être ajoutée.");
    if (op.status === "CLOSING_PENDING") throw new DomainError("LOCKED", "Clôture en cours : annulez le brouillon de clôture avant d'ajouter une dépense.");
    if (input.amount <= 0n) throw new DomainError("INVALID", "Montant invalide.");
    const expense = await tx.operationExpense.create({ data: { ...input, operationId, createdById: actor.id } });
    await audit(tx, actor, { action: "expense.create", entityType: "OperationExpense", entityId: expense.id, after: expense });
    return expense;
  });
}

export async function reviewExpense(actor: Actor, expenseId: string, decision: "APPROVED" | "REJECTED", note?: string) {
  requirePermission(actor, "expenses.review");
  return inTransaction(async (tx) => {
    const exp = await tx.operationExpense.findUnique({ where: { id: expenseId }, include: { operation: true } });
    if (!exp) throw new DomainError("NOT_FOUND", "Dépense introuvable.");
    if (exp.status !== "PENDING") throw new DomainError("ALREADY_REVIEWED", "Cette dépense a déjà été traitée.");
    if (exp.createdById === actor.id) throw new DomainError("FOUR_EYES", "Une dépense doit être validée par une autre personne que son auteur.");
    if (isFinanciallyLocked(exp.operation.status) || exp.operation.status === "CLOSING_PENDING")
      throw new DomainError("LOCKED", "Opération en clôture ou clôturée.");
    if (decision === "REJECTED" && !note?.trim()) throw new DomainError("REASON_REQUIRED", "Un motif de rejet est obligatoire.");
    await tx.operationExpense.update({
      where: { id: exp.id },
      data: { status: decision, reviewedById: actor.id, reviewedAt: new Date(), reviewNote: note },
    });
    await audit(tx, actor, { action: `expense.${decision.toLowerCase()}`, entityType: "OperationExpense", entityId: exp.id, before: { status: exp.status }, after: { status: decision }, reason: note });
  });
}

export async function publishUpdate(actor: Actor, operationId: string, title: string, body: string) {
  requirePermission(actor, "operations.manage");
  return inTransaction(async (tx) => {
    const op = await tx.operation.findUnique({ where: { id: operationId } });
    if (!op) throw new DomainError("NOT_FOUND", "Opération introuvable.");
    const upd = await tx.operationUpdate.create({ data: { operationId, title, body, authorId: actor.id } });
    const invs = await tx.investment.findMany({ where: { operationId }, select: { userId: true }, distinct: ["userId"] });
    for (const { userId } of invs) await notify(tx, userId, `${op.title} : ${title}`, body.slice(0, 200), `/vehicules/${op.slug}`);
    await audit(tx, actor, { action: "operation.update.publish", entityType: "OperationUpdate", entityId: upd.id, after: { title } });
    return upd;
  });
}
