// Clôture financière et réclamation des gains — CDC §8, §2.4, §18.
import { inTransaction, prisma, type Tx } from "../db";
import { computeDistribution, FORMULA_VERSION, LossRuleNotConfiguredError } from "../domain/profit-sharing";
import { DomainError } from "../errors";
import {
  getOperationPool,
  getSystemAccount,
  getUserWallet,
  postTransaction,
  SYSTEM_ACCOUNTS,
} from "../ledger/ledger";
import { formatMoney } from "../money";
import { audit, notify } from "./audit";
import { getLossRule } from "./settings";
import { requirePermission, type Actor } from "./types";

/** Calcule la clôture à partir des données comptables actuelles (sans rien écrire). */
async function computeClosure(tx: Tx, operationId: string) {
  const op = await tx.operation.findUnique({
    where: { id: operationId },
    include: {
      expenses: true,
      investments: { where: { status: "ACTIVE" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] },
    },
  });
  if (!op) throw new DomainError("NOT_FOUND", "Opération introuvable.");
  if (op.salePrice === null) throw new DomainError("NO_SALE", "Aucune vente déclarée.");
  const pending = op.expenses.filter((e) => e.status === "PENDING");
  if (pending.length > 0)
    throw new DomainError("PENDING_EXPENSES", `${pending.length} dépense(s) en attente de validation : traitez-les avant la clôture.`);

  // §2.4 : bénéfice net = recettes − ensemble des coûts réels approuvés.
  const totalCosts = op.expenses.filter((e) => e.status === "APPROVED").reduce((a, e) => a + e.amount, 0n);
  if (totalCosts === 0n)
    throw new DomainError("NO_COSTS", "Aucune dépense approuvée : le résultat ne peut pas être « prix de vente » seul (§2.4).");
  const netResult = op.salePrice - totalCosts;
  const lossRule = await getLossRule(tx);
  try {
    const distribution = computeDistribution({
      netResult,
      companyContribution: op.companyContribution,
      investments: op.investments.map((i) => ({ id: i.id, amount: i.amount })),
      lossRule,
    });
    return { op, totalCosts, netResult, lossRule, distribution };
  } catch (e) {
    if (e instanceof LossRuleNotConfiguredError) throw new DomainError("LOSS_RULE_UNSET", e.message);
    throw e;
  }
}

export async function previewClosure(operationId: string) {
  return computeClosure(prisma, operationId);
}

/** Prépare (ou recalcule) le brouillon de clôture. L'opération passe en « Clôture financière en attente ». */
export async function prepareClosure(actor: Actor, operationId: string) {
  requirePermission(actor, "closure.prepare");
  return inTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Operation" WHERE id = ${operationId} FOR UPDATE`;
    const current = await tx.operation.findUnique({ where: { id: operationId }, include: { closure: true } });
    if (!current) throw new DomainError("NOT_FOUND", "Opération introuvable.");
    if (current.status !== "SOLD" && current.status !== "CLOSING_PENDING")
      throw new DomainError("INVALID_STATE", "La clôture se prépare après la vente du véhicule.");
    if (current.closure?.status === "VALIDATED") throw new DomainError("ALREADY_CLOSED", "Clôture déjà validée.");

    const { op, totalCosts, netResult, lossRule, distribution: d } = await computeClosure(tx, operationId);
    if (current.closure) await tx.operationClosure.delete({ where: { id: current.closure.id } });

    const closure = await tx.operationClosure.create({
      data: {
        operationId,
        revenue: op.salePrice!,
        totalCosts,
        netResult,
        companyContribution: d.companyContribution,
        investorsTotal: d.investorsTotal,
        companyTheoreticalShare: d.companyTheoreticalShare,
        companyFinalShare: d.companyFinalShare,
        investorsEnvelope: d.investorsEnvelope,
        lossRule,
        formulaVersion: FORMULA_VERSION,
        preparedById: actor.id,
        settlements: {
          create: d.investors.map((r) => {
            const inv = op.investments.find((i) => i.id === r.id)!;
            return { investmentId: r.id, userId: inv.userId, capital: r.capital, result: r.result, claimable: r.claimable };
          }),
        },
      },
    });
    if (current.status === "SOLD") {
      await tx.operation.update({ where: { id: operationId }, data: { status: "CLOSING_PENDING" } });
      await tx.operationStatusChange.create({ data: { operationId, from: "SOLD", to: "CLOSING_PENDING", actorId: actor.id } });
    }
    await audit(tx, actor, { action: "closure.prepare", entityType: "OperationClosure", entityId: closure.id, after: { ...d, investors: d.investors.length, totalCosts, lossRule } });
    return closure;
  });
}

/** Validation par une seconde personne habilitée ; rend les montants réclamables. */
export async function validateClosure(actor: Actor, operationId: string) {
  requirePermission(actor, "closure.validate");
  return inTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Operation" WHERE id = ${operationId} FOR UPDATE`;
    const closure = await tx.operationClosure.findUnique({ where: { operationId }, include: { settlements: true, operation: true } });
    if (!closure) throw new DomainError("NOT_FOUND", "Aucun brouillon de clôture.");
    if (closure.status === "VALIDATED") throw new DomainError("ALREADY_CLOSED", "Clôture déjà validée.");
    if (closure.preparedById === actor.id)
      throw new DomainError("FOUR_EYES", "La clôture doit être validée par une autre personne que celle qui l'a préparée.");

    // Les chiffres ne doivent pas avoir changé depuis la préparation.
    const { distribution: d, totalCosts, lossRule } = await computeClosure(tx, operationId);
    const same =
      d.investorsEnvelope === closure.investorsEnvelope &&
      d.companyFinalShare === closure.companyFinalShare &&
      totalCosts === closure.totalCosts &&
      lossRule === closure.lossRule &&
      d.investors.length === closure.settlements.length &&
      d.investors.every((r) => closure.settlements.some((s) => s.investmentId === r.id && s.claimable === r.claimable));
    if (!same) throw new DomainError("STALE_CLOSURE", "Les données ont changé depuis la préparation : recalculez la clôture.");

    const pool = await getOperationPool(tx, operationId);
    const company = await getSystemAccount(tx, SYSTEM_ACCOUNTS.COMPANY);
    let ledgerTransactionId: string | null = null;
    if (closure.investorsEnvelope !== 0n) {
      // Gain : l'entreprise verse l'enveloppe dans le pool. Perte : le pool cède la perte à l'entreprise.
      const env = closure.investorsEnvelope;
      const { transaction } = await postTransaction(tx, {
        type: "CLOSURE_FUNDING",
        idempotencyKey: `closure:${operationId}`,
        description: `Clôture — ${closure.operation.title}`,
        createdById: actor.id,
        entries: [
          { accountId: company.id, amount: -env, memo: env > 0n ? "Enveloppe de gains des particuliers" : "Perte imputée aux particuliers" },
          { accountId: pool.id, amount: env, memo: env > 0n ? "Enveloppe de gains des particuliers" : "Perte imputée aux particuliers" },
        ],
      });
      ledgerTransactionId = transaction.id;
    }
    const now = new Date();
    await tx.operationClosure.update({
      where: { id: closure.id },
      data: { status: "VALIDATED", validatedById: actor.id, validatedAt: now, ledgerTransactionId },
    });
    await tx.investorSettlement.updateMany({ where: { closureId: closure.id }, data: { status: "CLAIMABLE" } });
    await tx.investment.updateMany({ where: { id: { in: closure.settlements.map((s) => s.investmentId) } }, data: { status: "SETTLED" } });
    await tx.operation.update({ where: { id: operationId }, data: { status: "CLOSED" } });
    await tx.operationStatusChange.create({ data: { operationId, from: closure.operation.status, to: "CLOSED", actorId: actor.id } });
    for (const s of closure.settlements) {
      await notify(tx, s.userId, `Clôture validée : ${closure.operation.title}`, `Montant récupérable : ${formatMoney(s.claimable)}. Réclamez-le depuis « Mes gains ».`, "/espace/gains");
    }
    await audit(tx, actor, { action: "closure.validate", entityType: "OperationClosure", entityId: closure.id, after: { investorsEnvelope: closure.investorsEnvelope, settlements: closure.settlements.length } });
  });
}

/** Annule un brouillon de clôture (ex. dépense oubliée). L'opération revient à « Vendu ». */
export async function discardClosureDraft(actor: Actor, operationId: string, reason: string) {
  requirePermission(actor, "closure.prepare");
  if (!reason.trim()) throw new DomainError("REASON_REQUIRED", "Un motif est obligatoire.");
  return inTransaction(async (tx) => {
    const closure = await tx.operationClosure.findUnique({ where: { operationId } });
    if (!closure || closure.status !== "DRAFT") throw new DomainError("INVALID_STATE", "Aucun brouillon de clôture à annuler.");
    await tx.operationClosure.delete({ where: { id: closure.id } });
    await tx.operation.update({ where: { id: operationId }, data: { status: "SOLD" } });
    await tx.operationStatusChange.create({ data: { operationId, from: "CLOSING_PENDING", to: "SOLD", reason, actorId: actor.id } });
    await audit(tx, actor, { action: "closure.discard", entityType: "OperationClosure", entityId: closure.id, reason });
  });
}

/**
 * « Réclamer mon capital et mes gains » (§8.3). Idempotent : un seul crédit par règlement.
 * Deux écritures distinctes : remboursement du capital, puis gain ou ajustement de perte.
 */
export async function claimSettlement(userId: string, settlementId: string) {
  return inTransaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "InvestorSettlement" WHERE id = ${settlementId} FOR UPDATE`;
    const s = await tx.investorSettlement.findUnique({ where: { id: settlementId }, include: { investment: { include: { operation: true } } } });
    if (!s || s.userId !== userId) throw new DomainError("NOT_FOUND", "Règlement introuvable.");
    if (s.status === "CLAIMED") return { settlement: s, replayed: true };
    if (s.status !== "CLAIMABLE") throw new DomainError("NOT_CLAIMABLE", "La clôture de cette opération n'est pas encore validée.");

    let ledgerTransactionId: string | null = null;
    if (s.claimable > 0n) {
      const pool = await getOperationPool(tx, s.investment.operationId);
      const wallet = await getUserWallet(tx, userId);
      const entries = [
        { accountId: pool.id, amount: -s.capital, memo: "Remboursement du capital" },
        { accountId: wallet.id, amount: s.capital, memo: "Remboursement du capital" },
      ];
      if (s.result !== 0n) {
        const memo = s.result > 0n ? "Bénéfice de l'opération" : "Ajustement de perte";
        entries.push({ accountId: pool.id, amount: -s.result, memo }, { accountId: wallet.id, amount: s.result, memo });
      }
      const { transaction } = await postTransaction(tx, {
        type: "CLAIM",
        idempotencyKey: `claim:${s.id}`,
        description: `Réclamation — ${s.investment.operation.title}`,
        createdById: userId,
        entries,
      });
      ledgerTransactionId = transaction.id;
    }
    const updated = await tx.investorSettlement.update({
      where: { id: s.id },
      data: { status: "CLAIMED", claimedAt: new Date(), ledgerTransactionId },
    });
    await audit(tx, { id: userId, role: "INVESTOR" }, { action: "settlement.claim", entityType: "InvestorSettlement", entityId: s.id, after: { claimable: s.claimable } });
    return { settlement: updated, replayed: false };
  });
}
