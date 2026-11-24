// Grand livre en partie double — CDC §6.2.
// - chaque mouvement = une LedgerTransaction équilibrée (somme des écritures = 0) ;
// - les écritures ne sont jamais modifiées ni supprimées (triggers en base) ;
// - les corrections passent par une transaction inverse (REVERSAL) ;
// - chaque transaction a une référence unique et une clé d'idempotence unique ;
// - le solde d'un compte est la somme de ses écritures.
import { randomBytes } from "node:crypto";
import type { LedgerAccount, LedgerTransaction, LedgerTransactionType } from "@prisma/client";
import type { Tx } from "../db";
import { REFERENCE_CURRENCY } from "../money";
import { DomainError } from "../errors";

export const SYSTEM_ACCOUNTS = {
  COMPANY: "SYS:COMPANY",
  EXTERNAL: "SYS:EXTERNAL",
} as const;

export interface EntryInput {
  accountId: string;
  amount: bigint;
  memo?: string;
}

export interface PostInput {
  type: LedgerTransactionType;
  idempotencyKey: string;
  description: string;
  createdById?: string | null;
  reversesId?: string;
  entries: EntryInput[];
}

export function newReference(prefix = "TX"): string {
  const d = new Date();
  const date = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  return `${prefix}-${date}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

export async function getSystemAccount(tx: Tx, code: (typeof SYSTEM_ACCOUNTS)[keyof typeof SYSTEM_ACCOUNTS]) {
  const type = code === SYSTEM_ACCOUNTS.COMPANY ? "COMPANY" : "EXTERNAL";
  return tx.ledgerAccount.upsert({
    where: { code },
    update: {},
    create: { code, type, currency: REFERENCE_CURRENCY },
  });
}

export async function getUserWallet(tx: Tx, userId: string): Promise<LedgerAccount> {
  return tx.ledgerAccount.upsert({
    where: { userId },
    update: {},
    create: { code: `WALLET:${userId}`, type: "USER_WALLET", userId, currency: REFERENCE_CURRENCY },
  });
}

export async function getOperationPool(tx: Tx, operationId: string): Promise<LedgerAccount> {
  return tx.ledgerAccount.upsert({
    where: { operationId },
    update: {},
    create: { code: `POOL:${operationId}`, type: "OPERATION_POOL", operationId, currency: REFERENCE_CURRENCY },
  });
}

/** Verrou exclusif sur un compte jusqu'à la fin de la transaction SQL (sérialise les débits). */
export async function lockAccount(tx: Tx, accountId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "LedgerAccount" WHERE id = ${accountId} FOR UPDATE`;
}

export async function accountBalance(tx: Tx, accountId: string): Promise<bigint> {
  const agg = await tx.ledgerEntry.aggregate({ where: { accountId }, _sum: { amount: true } });
  return agg._sum.amount ?? 0n;
}

export async function findByIdempotencyKey(tx: Tx, idempotencyKey: string) {
  return tx.ledgerTransaction.findUnique({ where: { idempotencyKey }, include: { entries: true } });
}

/**
 * Enregistre une transaction équilibrée. Si la clé d'idempotence existe déjà,
 * la transaction existante est renvoyée et rien n'est écrit (`created: false`).
 */
export async function postTransaction(
  tx: Tx,
  input: PostInput,
): Promise<{ transaction: LedgerTransaction; created: boolean }> {
  const existing = await findByIdempotencyKey(tx, input.idempotencyKey);
  if (existing) return { transaction: existing, created: false };

  const entries = input.entries.filter((e) => e.amount !== 0n);
  if (entries.length < 2) throw new DomainError("LEDGER_EMPTY", "Transaction comptable sans écritures.");
  const sum = entries.reduce((a, e) => a + e.amount, 0n);
  if (sum !== 0n) throw new DomainError("LEDGER_UNBALANCED", "Transaction comptable déséquilibrée.");

  const transaction = await tx.ledgerTransaction.create({
    data: {
      reference: newReference(),
      idempotencyKey: input.idempotencyKey,
      type: input.type,
      description: input.description,
      createdById: input.createdById ?? null,
      reversesId: input.reversesId,
      entries: { create: entries.map((e) => ({ accountId: e.accountId, amount: e.amount, memo: e.memo })) },
    },
  });
  return { transaction, created: true };
}

/** Annule une transaction par écriture inverse (jamais par effacement). */
export async function reverseTransaction(
  tx: Tx,
  transactionId: string,
  reason: string,
  createdById: string,
): Promise<LedgerTransaction> {
  const original = await tx.ledgerTransaction.findUnique({
    where: { id: transactionId },
    include: { entries: true, reversedBy: true },
  });
  if (!original) throw new DomainError("NOT_FOUND", "Transaction introuvable.");
  if (original.reversedBy) throw new DomainError("ALREADY_REVERSED", "Cette transaction a déjà été annulée.");
  const { transaction } = await postTransaction(tx, {
    type: "REVERSAL",
    idempotencyKey: `reversal:${original.id}`,
    description: `Annulation de ${original.reference} — ${reason}`,
    createdById,
    reversesId: original.id,
    entries: original.entries.map((e) => ({ accountId: e.accountId, amount: -e.amount, memo: "Écriture inverse" })),
  });
  return transaction;
}
