// Parcours d'investissement — CDC §7.1 et §18.
import { inTransaction } from "../db";
import { isInvestable } from "../domain/operation-status";
import { DomainError } from "../errors";
import {
  accountBalance,
  findByIdempotencyKey,
  getOperationPool,
  getUserWallet,
  lockAccount,
  postTransaction,
} from "../ledger/ledger";
import { formatMoney } from "../money";
import { audit, notify } from "./audit";
import { getSetting } from "./settings";

export interface InvestInput {
  userId: string;
  operationId: string;
  amount: bigint;
  /** généré par le formulaire : un double envoi ne crée qu'un investissement */
  idempotencyKey: string;
  riskAccepted: boolean;
  termsVersion: string;
}

export async function invest(input: InvestInput) {
  if (!input.riskAccepted) {
    throw new DomainError("RISK_NOT_ACCEPTED", "Vous devez confirmer avoir pris connaissance des risques.");
  }
  if (!/^[\w-]{8,100}$/.test(input.idempotencyKey)) {
    throw new DomainError("INVALID_KEY", "Requête invalide, veuillez recharger la page.");
  }
  const ledgerKey = `invest:${input.userId}:${input.idempotencyKey}`;

  return inTransaction(async (tx) => {
    // Verrou sur l'opération : sérialise les investissements concurrents (plafond).
    await tx.$queryRaw`SELECT id FROM "Operation" WHERE id = ${input.operationId} FOR UPDATE`;

    // Rejouer une requête déjà traitée renvoie le même investissement.
    const replay = await findByIdempotencyKey(tx, ledgerKey);
    if (replay) {
      const inv = await tx.investment.findUnique({ where: { ledgerTransactionId: replay.id } });
      if (inv) return { investment: inv, replayed: true };
    }
    const op = await tx.operation.findUnique({ where: { id: input.operationId } });
    if (!op) throw new DomainError("NOT_FOUND", "Opération introuvable.");

    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new DomainError("NOT_FOUND", "Utilisateur introuvable.");
    if (user.status !== "ACTIVE" || !user.emailVerifiedAt) {
      throw new DomainError("ACCOUNT_NOT_AUTHORIZED", "Votre compte doit être vérifié et actif pour investir.");
    }
    if (!isInvestable(op.status)) {
      throw new DomainError("NOT_INVESTABLE", "Cette opération n'est pas ouverte au financement.");
    }

    const globalMin = BigInt(await getSetting("MIN_INVESTMENT", tx));
    const min = op.minInvestment > globalMin ? op.minInvestment : globalMin;
    if (input.amount < min) {
      throw new DomainError("BELOW_MIN", `Le montant minimum d'investissement est de ${formatMoney(min)}.`);
    }
    const remaining = op.investorTarget - op.investorFunded;
    if (input.amount > remaining) {
      throw new DomainError("ABOVE_REMAINING", `Le montant restant à financer est de ${formatMoney(remaining)}.`);
    }
    if (op.maxPerInvestor !== null) {
      const already = await tx.investment.aggregate({
        where: { userId: user.id, operationId: op.id, status: "ACTIVE" },
        _sum: { amount: true },
      });
      const total = (already._sum.amount ?? 0n) + input.amount;
      if (total > op.maxPerInvestor) {
        throw new DomainError(
          "ABOVE_MAX",
          `Le plafond par investisseur pour cette opération est de ${formatMoney(op.maxPerInvestor)}.`,
        );
      }
    }

    const wallet = await getUserWallet(tx, user.id);
    await lockAccount(tx, wallet.id);
    const balance = await accountBalance(tx, wallet.id);
    if (balance < input.amount) {
      throw new DomainError("INSUFFICIENT_FUNDS", `Solde disponible insuffisant (${formatMoney(balance)}).`);
    }

    const pool = await getOperationPool(tx, op.id);
    const { transaction } = await postTransaction(tx, {
      type: "INVESTMENT",
      idempotencyKey: ledgerKey,
      description: `Investissement — ${op.title}`,
      createdById: user.id,
      entries: [
        { accountId: wallet.id, amount: -input.amount, memo: "Investissement" },
        { accountId: pool.id, amount: input.amount, memo: `Participation de ${user.firstName} ${user.lastName}` },
      ],
    });

    const investment = await tx.investment.create({
      data: {
        userId: user.id,
        operationId: op.id,
        amount: input.amount,
        riskAcceptedAt: new Date(),
        termsVersion: input.termsVersion,
        ledgerTransactionId: transaction.id,
      },
    });

    const funded = op.investorFunded + input.amount;
    const reached = funded === op.investorTarget;
    await tx.operation.update({
      where: { id: op.id },
      data: { investorFunded: funded, ...(reached ? { status: "FUNDED" } : {}) },
    });
    if (reached) {
      await tx.operationStatusChange.create({
        data: { operationId: op.id, from: op.status, to: "FUNDED", reason: "Objectif atteint", actorId: "SYSTEM" },
      });
    }

    await audit(tx, { id: user.id, role: user.role }, {
      action: "investment.create",
      entityType: "Investment",
      entityId: investment.id,
      after: { operationId: op.id, amount: input.amount, transaction: transaction.reference, termsVersion: input.termsVersion },
    });
    await notify(
      tx,
      user.id,
      "Investissement confirmé",
      `Votre participation de ${formatMoney(input.amount)} dans « ${op.title} » est enregistrée (reçu ${transaction.reference}).`,
      "/espace/investissements",
    );
    return { investment, replayed: false };
  });
}
