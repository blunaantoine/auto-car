// Dépôts internationaux par agents locaux — CDC §9 (parcours, statuts, contrôles anti-fraude) et §11.
//
// Cycle : l'investisseur paie l'agent hors plateforme puis déclare sa référence → AWAITING_AGENT
//   → l'agent vérifie la réception réelle et confirme (ou rejette)
//   → crédit immédiat si le montant est sous le seuil, sinon CONFIRMED_BY_AGENT puis validation financière
//   → CREDITED (écriture au grand livre, idempotente).
// Un dépôt en attente n'est jamais investissable. Une capture d'écran ne suffit jamais.
import { randomBytes } from "node:crypto";
import type { DepositRequest } from "@prisma/client";
import { inTransaction, prisma, type Tx } from "../db";
import { quoteDeposit } from "../domain/deposit";
import { DomainError } from "../errors";
import { getSystemAccount, getUserWallet, postTransaction, SYSTEM_ACCOUNTS } from "../ledger/ledger";
import { formatMoney } from "../money";
import { PROOF_BUCKET, uploadPrivateImage } from "../storage";
import { currentRate } from "./agents";
import { audit, notify } from "./audit";
import { getSetting } from "./settings";
import { requirePermission, type Actor } from "./types";

const MAX_OPEN_REQUESTS = 5;
const ACTIVE_STATUSES = ["AWAITING_AGENT", "CONFIRMED_BY_AGENT", "CREDITED", "DISPUTED"] as const;

const local = (amount: bigint, currency: string) => formatMoney(amount, currency === "XOF" || currency === "XAF" ? "FCFA" : currency);

function newDepositReference() {
  return `DEP-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/** Devis affiché avant soumission (montant, frais, taux, montant crédité). */
export async function quoteForMethod(methodId: string, amountLocal: bigint) {
  const m = await prisma.agentPaymentMethod.findUnique({ where: { id: methodId }, include: { agent: true } });
  if (!m || !m.active || m.agent.status !== "ACTIVE" || !m.agent.canDeposit)
    throw new DomainError("UNAVAILABLE", "Ce moyen de paiement n'est pas disponible.");
  if (amountLocal < m.minAmount) throw new DomainError("BELOW_MIN", `Minimum pour ce moyen de paiement : ${local(m.minAmount, m.currency)}.`);
  if (m.maxAmount !== null && amountLocal > m.maxAmount) throw new DomainError("ABOVE_MAX", `Maximum pour ce moyen de paiement : ${local(m.maxAmount, m.currency)}.`);
  const rate = await currentRate(m.currency);
  if (!rate) throw new DomainError("NO_RATE", `Taux de change indisponible pour ${m.currency}.`);
  const q = quoteDeposit(amountLocal, m.feeFixed, m.feeBps, rate.rate);
  const min = BigInt(await getSetting("MIN_DEPOSIT"));
  if (q.amountCredited < min) throw new DomainError("BELOW_MIN", `Après frais et conversion, le dépôt minimum est de ${formatMoney(min)}.`);
  return { method: m, quote: q, rateSource: rate.source };
}

export interface SubmitDepositInput {
  userId: string;
  methodId: string;
  amountLocal: bigint;
  payerReference: string;
  payerAccount?: string | null;
  proof?: Uint8Array | null;
}

export async function submitDeposit(input: SubmitDepositInput) {
  const payerReference = input.payerReference.trim().toUpperCase();
  if (payerReference.length < 4) throw new DomainError("REFERENCE_REQUIRED", "Indiquez la référence de transaction donnée par l'opérateur.");
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user || user.status !== "ACTIVE" || !user.emailVerifiedAt)
    throw new DomainError("ACCOUNT_NOT_AUTHORIZED", "Votre compte doit être vérifié et actif.");
  const { method, quote, rateSource } = await quoteForMethod(input.methodId, input.amountLocal);
  const proofPath = input.proof?.length ? await uploadPrivateImage(PROOF_BUCKET, `deposits/${user.id}`, input.proof) : null;
  const hours = Number(await getSetting("DEPOSIT_EXPIRY_HOURS"));

  return inTransaction(async (tx) => {
    // Anti-fraude : une même référence de transaction ne peut servir qu'une fois, tous opérateurs confondus (§9.5).
    const dup = await tx.depositRequest.findFirst({
      where: { payerReference, status: { in: [...ACTIVE_STATUSES] } },
    });
    if (dup) throw new DomainError("DUPLICATE_REFERENCE", "Cette référence de transaction a déjà été déclarée.");
    const open = await tx.depositRequest.count({ where: { userId: user.id, status: { in: ["AWAITING_AGENT", "CONFIRMED_BY_AGENT"] } } });
    if (open >= MAX_OPEN_REQUESTS) throw new DomainError("TOO_MANY", `Vous avez déjà ${open} dépôts en attente : patientez avant d'en déclarer d'autres.`);

    const d = await tx.depositRequest.create({
      data: {
        reference: newDepositReference(),
        userId: user.id,
        agentId: method.agentId,
        methodId: method.id,
        countryCode: method.agent.countryCode,
        provider: method.provider,
        currency: method.currency,
        amountLocal: quote.amountLocal,
        feeLocal: quote.feeLocal,
        rate: quote.rate,
        rateSource,
        amountCredited: quote.amountCredited,
        payerReference,
        payerAccount: input.payerAccount?.trim() || null,
        proofPath,
        expiresAt: new Date(Date.now() + hours * 3600_000),
      },
    });
    await audit(tx, { id: user.id, role: user.role }, { action: "deposit.submit", entityType: "DepositRequest", entityId: d.id, after: { reference: d.reference, amountLocal: d.amountLocal, currency: d.currency, payerReference } });
    await notify(tx, method.agent.userId, "Nouveau dépôt à vérifier", `${local(d.amountLocal, d.currency)} via ${d.provider}, réf. ${payerReference} (${d.reference}).`, "/agent");
    await notify(tx, user.id, "Dépôt déclaré", `Votre dépôt ${d.reference} est en attente de vérification par l'agent. Il n'est pas encore investissable.`, "/espace/depot");
    return d;
  });
}

/** Les demandes non traitées dans le délai expirent (§9.5). */
export async function expireStaleDeposits() {
  const stale = await prisma.depositRequest.findMany({ where: { status: "AWAITING_AGENT", expiresAt: { lt: new Date() } }, select: { id: true, userId: true, reference: true } });
  for (const d of stale) {
    await inTransaction(async (tx) => {
      const r = await tx.depositRequest.updateMany({ where: { id: d.id, status: "AWAITING_AGENT" }, data: { status: "EXPIRED" } });
      if (r.count) {
        await audit(tx, null, { action: "deposit.expire", entityType: "DepositRequest", entityId: d.id });
        await notify(tx, d.userId, "Dépôt expiré", `Le dépôt ${d.reference} n'a pas été confirmé à temps. Contactez l'assistance si vous avez bien payé.`, "/espace/depot");
      }
    });
  }
  return stale.length;
}

async function lockDeposit(tx: Tx, id: string) {
  await tx.$queryRaw`SELECT id FROM "DepositRequest" WHERE id = ${id} FOR UPDATE`;
  const d = await tx.depositRequest.findUnique({ where: { id }, include: { agent: true } });
  if (!d) throw new DomainError("NOT_FOUND", "Demande introuvable.");
  return d;
}

/** Écriture au grand livre — idempotente (clé liée à la demande). */
async function credit(tx: Tx, d: DepositRequest & { agent: { displayName: string } }, actor: Actor) {
  const wallet = await getUserWallet(tx, d.userId);
  const external = await getSystemAccount(tx, SYSTEM_ACCOUNTS.EXTERNAL);
  const { transaction } = await postTransaction(tx, {
    type: "DEPOSIT",
    idempotencyKey: `deposit-request:${d.id}`,
    description: `Dépôt ${d.reference} — ${d.provider} via ${d.agent.displayName}`,
    createdById: actor.id,
    entries: [
      { accountId: wallet.id, amount: d.amountCredited, memo: `Dépôt ${d.reference}` },
      { accountId: external.id, amount: -d.amountCredited, memo: `${d.provider} réf. ${d.payerReference} — agent ${d.agent.displayName}` },
    ],
  });
  await tx.depositRequest.update({
    where: { id: d.id },
    data: { status: "CREDITED", creditedAt: new Date(), creditedById: actor.id, ledgerTransactionId: transaction.id },
  });
  await notify(tx, d.userId, "Dépôt crédité", `${formatMoney(d.amountCredited)} ont été crédités sur votre portefeuille (${d.reference}).`, "/espace");
  return transaction;
}

/** L'agent confirme avoir réellement reçu les fonds. Il ne traite que ses propres demandes. */
export async function agentConfirmDeposit(actor: Actor, depositId: string, agentReference: string, note?: string) {
  requirePermission(actor, "agent.access");
  if (agentReference.trim().length < 3) throw new DomainError("REFERENCE_REQUIRED", "Indiquez la référence vérifiée chez l'opérateur.");
  const threshold = BigInt(await getSetting("DEPOSIT_REVIEW_THRESHOLD"));
  return inTransaction(async (tx) => {
    const d = await lockDeposit(tx, depositId);
    if (d.agent.userId !== actor.id) throw new DomainError("NOT_FOUND", "Demande introuvable.");
    if (d.agent.status !== "ACTIVE") throw new DomainError("AGENT_INACTIVE", "Votre compte agent n'est pas actif.");
    if (d.status !== "AWAITING_AGENT") throw new DomainError("ALREADY_PROCESSED", "Cette demande a déjà été traitée.");
    if (d.expiresAt < new Date()) throw new DomainError("EXPIRED", "Cette demande a expiré.");
    await tx.depositRequest.update({
      where: { id: d.id },
      data: { status: "CONFIRMED_BY_AGENT", confirmedAt: new Date(), confirmedById: actor.id, agentReference: agentReference.trim(), agentNote: note?.trim() || null },
    });
    await audit(tx, actor, { action: "deposit.agent_confirm", entityType: "DepositRequest", entityId: d.id, after: { agentReference, amountCredited: d.amountCredited } });
    if (d.amountCredited <= threshold) {
      await credit(tx, { ...d, status: "CONFIRMED_BY_AGENT" }, actor);
      return "CREDITED" as const;
    }
    const financeUsers = await tx.user.findMany({ where: { role: { in: ["FINANCE", "SUPER_ADMIN"] }, status: "ACTIVE" }, select: { id: true } });
    for (const f of financeUsers)
      await notify(tx, f.id, "Dépôt à valider", `${d.reference} : ${formatMoney(d.amountCredited)} confirmé par ${d.agent.displayName}, au-delà du seuil.`, "/admin/depots");
    return "CONFIRMED_BY_AGENT" as const;
  });
}

export async function agentRejectDeposit(actor: Actor, depositId: string, reason: string) {
  requirePermission(actor, "agent.access");
  if (!reason.trim()) throw new DomainError("REASON_REQUIRED", "Indiquez le motif du rejet.");
  await inTransaction(async (tx) => {
    const d = await lockDeposit(tx, depositId);
    if (d.agent.userId !== actor.id) throw new DomainError("NOT_FOUND", "Demande introuvable.");
    if (d.status !== "AWAITING_AGENT") throw new DomainError("ALREADY_PROCESSED", "Cette demande a déjà été traitée.");
    await tx.depositRequest.update({ where: { id: d.id }, data: { status: "REJECTED", rejectReason: reason.trim() } });
    await audit(tx, actor, { action: "deposit.agent_reject", entityType: "DepositRequest", entityId: d.id, reason });
    await notify(tx, d.userId, "Dépôt rejeté par l'agent", `${d.reference} : ${reason}`, "/espace/depot");
  });
}

/** Validation financière (dépôt au-delà du seuil, ou litige résolu en faveur du crédit). */
export async function financeValidateDeposit(actor: Actor, depositId: string, note?: string) {
  requirePermission(actor, "deposits.review");
  return inTransaction(async (tx) => {
    const d = await lockDeposit(tx, depositId);
    if (d.status === "CREDITED") throw new DomainError("ALREADY_PROCESSED", "Ce dépôt est déjà crédité.");
    if (d.status !== "CONFIRMED_BY_AGENT" && d.status !== "DISPUTED")
      throw new DomainError("NOT_CONFIRMED", "Le dépôt doit d'abord être confirmé par l'agent.");
    if (d.status === "DISPUTED" && !d.confirmedAt) throw new DomainError("NOT_CONFIRMED", "Réception jamais confirmée par l'agent.");
    await tx.depositRequest.update({ where: { id: d.id }, data: { reviewNote: note?.trim() || null } });
    const t = await credit(tx, d, actor);
    await audit(tx, actor, { action: "deposit.finance_validate", entityType: "DepositRequest", entityId: d.id, after: { transaction: t.reference }, reason: note });
    return t;
  });
}

export async function financeRejectDeposit(actor: Actor, depositId: string, reason: string) {
  requirePermission(actor, "deposits.review");
  if (!reason.trim()) throw new DomainError("REASON_REQUIRED", "Un motif est obligatoire.");
  await inTransaction(async (tx) => {
    const d = await lockDeposit(tx, depositId);
    if (!["AWAITING_AGENT", "CONFIRMED_BY_AGENT", "DISPUTED"].includes(d.status))
      throw new DomainError("ALREADY_PROCESSED", "Cette demande ne peut plus être rejetée.");
    await tx.depositRequest.update({ where: { id: d.id }, data: { status: "REJECTED", rejectReason: reason.trim() } });
    await audit(tx, actor, { action: "deposit.finance_reject", entityType: "DepositRequest", entityId: d.id, reason });
    await notify(tx, d.userId, "Dépôt rejeté", `${d.reference} : ${reason}`, "/espace/depot");
  });
}

/** Litige : bloque la demande jusqu'à décision (§13). */
export async function disputeDeposit(actor: Actor, depositId: string, reason: string) {
  requirePermission(actor, "deposits.review");
  if (!reason.trim()) throw new DomainError("REASON_REQUIRED", "Un motif est obligatoire.");
  await inTransaction(async (tx) => {
    const d = await lockDeposit(tx, depositId);
    if (!["AWAITING_AGENT", "CONFIRMED_BY_AGENT"].includes(d.status)) throw new DomainError("ALREADY_PROCESSED", "Cette demande ne peut plus être mise en litige.");
    await tx.depositRequest.update({ where: { id: d.id }, data: { status: "DISPUTED", reviewNote: reason.trim() } });
    await audit(tx, actor, { action: "deposit.dispute", entityType: "DepositRequest", entityId: d.id, reason });
    await notify(tx, d.userId, "Dépôt en litige", `${d.reference} est en cours de vérification par notre équipe.`, "/espace/depot");
  });
}

export async function cancelDeposit(userId: string, depositId: string) {
  await inTransaction(async (tx) => {
    const d = await lockDeposit(tx, depositId);
    if (d.userId !== userId) throw new DomainError("NOT_FOUND", "Demande introuvable.");
    if (d.status !== "AWAITING_AGENT") throw new DomainError("ALREADY_PROCESSED", "Cette demande ne peut plus être annulée.");
    await tx.depositRequest.update({ where: { id: d.id }, data: { status: "CANCELLED" } });
    await audit(tx, { id: userId, role: "INVESTOR" }, { action: "deposit.cancel", entityType: "DepositRequest", entityId: d.id });
  });
}
