import { prisma, inTransaction } from "../db";
import { DomainError } from "../errors";
import { accountBalance, getSystemAccount, getUserWallet, postTransaction, SYSTEM_ACCOUNTS } from "../ledger/ledger";
import { formatMoney } from "../money";
import { audit, notify } from "./audit";
import { getSetting } from "./settings";
import { requirePermission, type Actor } from "./types";

export async function getWalletSummary(userId: string) {
  const wallet = await prisma.ledgerAccount.findUnique({ where: { userId } });
  const available = wallet ? await accountBalance(prisma, wallet.id) : 0n;
  const [invested, claimable, pending] = await Promise.all([
    prisma.investment.aggregate({ where: { userId, status: "ACTIVE" }, _sum: { amount: true } }),
    prisma.investorSettlement.aggregate({ where: { userId, status: "CLAIMABLE" }, _sum: { claimable: true } }),
    prisma.depositRequest.aggregate({ where: { userId, status: { in: ["AWAITING_AGENT", "CONFIRMED_BY_AGENT", "DISPUTED"] } }, _sum: { amountCredited: true } }),
  ]);
  return {
    available,
    pending: pending._sum.amountCredited ?? 0n, // dépôts déclarés, non encore crédités : jamais investissables
    invested: invested._sum.amount ?? 0n,
    claimable: claimable._sum.claimable ?? 0n,
  };
}

export async function getWalletHistory(userId: string, take = 50) {
  const wallet = await prisma.ledgerAccount.findUnique({ where: { userId } });
  if (!wallet) return [];
  return prisma.ledgerEntry.findMany({
    where: { accountId: wallet.id },
    include: { transaction: true },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });
}

/**
 * Crédit d'un dépôt reçu hors plateforme, saisi par un responsable financier.
 * Solution transitoire avant les dépôts par agents (phase 3) : la référence
 * externe est unique, ce qui empêche de créditer deux fois le même paiement.
 */
export async function creditDeposit(
  actor: Actor,
  input: { userId: string; amount: bigint; externalReference: string; reason: string },
) {
  requirePermission(actor, "wallet.credit");
  const ref = input.externalReference.trim();
  if (!ref) throw new DomainError("REFERENCE_REQUIRED", "La référence du paiement est obligatoire.");
  if (!input.reason.trim()) throw new DomainError("REASON_REQUIRED", "Un motif est obligatoire.");
  const min = BigInt(await getSetting("MIN_DEPOSIT"));
  if (input.amount < min) throw new DomainError("BELOW_MIN", `Le dépôt minimum est de ${formatMoney(min)}.`);

  return inTransaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: input.userId } });
    if (!user) throw new DomainError("NOT_FOUND", "Utilisateur introuvable.");
    const idempotencyKey = `deposit:${ref.toUpperCase()}`;
    const existing = await tx.ledgerTransaction.findUnique({ where: { idempotencyKey } });
    if (existing) throw new DomainError("DUPLICATE_REFERENCE", "Cette référence de paiement a déjà été créditée.");

    const wallet = await getUserWallet(tx, user.id);
    const external = await getSystemAccount(tx, SYSTEM_ACCOUNTS.EXTERNAL);
    const { transaction } = await postTransaction(tx, {
      type: "DEPOSIT",
      idempotencyKey,
      description: `Dépôt — réf. ${ref}`,
      createdById: actor.id,
      entries: [
        { accountId: wallet.id, amount: input.amount, memo: "Dépôt crédité" },
        { accountId: external.id, amount: -input.amount, memo: `Réf. externe ${ref}` },
      ],
    });
    await audit(tx, actor, {
      action: "wallet.deposit.credit",
      entityType: "User",
      entityId: user.id,
      after: { amount: input.amount, externalReference: ref, transaction: transaction.reference },
      reason: input.reason,
    });
    await notify(tx, user.id, "Dépôt crédité", `${formatMoney(input.amount)} ont été crédités sur votre portefeuille.`, "/espace");
    return transaction;
  });
}
